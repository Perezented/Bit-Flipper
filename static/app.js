(() => {
  const numberInput = document.getElementById('number-input');
  const bitField = document.getElementById('bitField');
  const valueUnit = document.getElementById('value-unit');
  const modeSelect = document.getElementById('mode');
  const loader = document.getElementById('loader');

  const chunkSize = 512; // groups per chunk when chunking (for byte-level)
  const CHUNK_CELL_THRESHOLD = 100000; // total bit cells to trigger chunked rendering
  const NO_ANIM_BYTE_GROUPS = 128; // disable per-bit animation above this many byte groups

  const inputLabel = document.getElementById('input-label');

  // default mode: "binary" (treat input as a number of bits and show bytes)
  let mode = modeSelect?.value || 'binary';

  // Keep last bits to animate differences
  let lastBits = [];

  function parseNumber(text) {
    if (!text) return 0n;
    text = text.trim();
    // support decimal or 0x hex
    try {
      if (text.startsWith('0x') || text.startsWith('0X')) return BigInt(text);
      return BigInt(text.replace(/_/g, ''));
    } catch (e) {
      return 0n;
    }
  }

  function humanizeBytes(bytes) {
    const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
    let b = Number(bytes);
    let i = 0;
    while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
    return `${b % 1 === 0 ? b.toFixed(0) : b.toFixed(2)} ${units[i]}`;
  }
    // Humanize bytes with BigInt support — if very large, fall back to larger units.
    function humanizeBytes(bytes) {
      const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
      // Accept BigInt or Number
      if (typeof bytes === 'bigint') {
        let b = bytes;
        let i = 0;
        while (b >= 1024n && i < units.length - 1) { b = b / 1024n; i++; }
        // For very large numbers, just show the integer part
        if (b > 900n) return `${String(b)} ${units[i]}`;
        // Otherwise convert to Number to allow decimals
        const bn = Number(bytes);
        let dd = bn;
        let j = 0;
        while (dd >= 1024 && j < units.length - 1) { dd /= 1024; j++; }
        return `${dd % 1 === 0 ? dd.toFixed(0) : dd.toFixed(2)} ${units[j]}`;
      }
      // fallback for numbers
      const unitsN = ['bytes', 'KB', 'MB', 'GB', 'TB'];
      let bN = Number(bytes);
      let iN = 0;
      while (bN >= 1024 && iN < unitsN.length - 1) { bN /= 1024; iN++; }
      return `${bN % 1 === 0 ? bN.toFixed(0) : bN.toFixed(2)} ${unitsN[iN]}`;
    }

    // Precompute useful group counts and fractions without materializing full bit arrays.
    function computeGroupCountsForBitcount(totalBitsBig) {
      const totalBits = BigInt(totalBitsBig);
      const totalBytes = totalBits / 8n;
      const groupCount = Number((totalBits + BigInt(BITS_PER_GROUP) - 1n) / BigInt(BITS_PER_GROUP));
      // For each KB group we can compute number of ones quickly without creating strings.
      const kbFractions = [];
      const maxIter = 8192 * 1024; // sanity cap — not usually reached; kept as a guard, but not used.
      for (let gi = 0; gi < groupCount; gi++) {
        const start = BigInt(gi) * BigInt(BITS_PER_GROUP);
        const end = start + BigInt(BITS_PER_GROUP);
        const ones = start >= totalBits ? 0n : (end <= totalBits ? BigInt(BITS_PER_GROUP) : (totalBits - start));
        kbFractions.push(Number(ones) / BITS_PER_GROUP);
      }
      return { totalBits, totalBytes, groupCount, kbFractions };
    }

  // Grouping constants (bytes)
  // We treat a "KB block" here as 1024 bytes (8192 bits).
  const GROUP_BYTES = 1024; // a KB block in our UI = 1024 bytes
  const BITS_PER_GROUP = GROUP_BYTES * 8; // 8192 bits per visual KB block
  // Make an MB-level group be 1024 KB groups (follows binary units: 1024 KB = 1 MB)
  const GROUPS_PER_LEVEL = 1024; // how many KB blocks make an MB

  function render(value) {
    // value is a BigInt from the input; interpretation depends on `mode`.
    let bytes = [];
    let bytesCountForUnit = 0n;
    const START = 2025;
    const now = new Date().getFullYear();
    const el = document.getElementById('copyright-year');
    if (el) el.textContent = now === START ? String(START) : `${START} - ${now}`;
    // (render-level constants moved to top for consistency)

    // Hoist these variables so they can be used outside the bitcount block
    let groupCount = 0;
    let totalBitsBI = 0n;

    if (mode === 'bitcount') {
      // interpret `value` as a bit count
      const totalBits = BigInt(value);
      const fullBytes = totalBits / 8n; // BigInt
      const remainder = Number(totalBits % 8n);
      bytesCountForUnit = fullBytes;

      // If we are in the grouped case, avoid creating many full arrays of bits
      // — instead compute group counts/fractions and lazily build data only for canvases we'll render.
      const useGrouping = fullBytes >= BigInt(GROUP_BYTES);
      if (!useGrouping) {
        // small: build per-byte arrays as before
        for (let i = 0n; i < fullBytes; i++) bytes.push(Array(8).fill('1'));
        if (remainder > 0) {
          const partial = Array(8).fill('0');
          for (let i = 0; i < remainder; i++) partial[i] = '1';
          bytes.push(partial);
        }
        if (bytes.length === 0) bytes.push(Array(8).fill('0'));
      } else {
        // large: do not create per-byte arrays — compute just the counts needed
        // We'll set bytes to be an array of empty placeholders for sizing only.
        const totalBytesNumber = Number(fullBytes > 9_000_000_000n ? 9_000_000_000 : fullBytes); // cap for Number conversion
        // create lightweight placeholders to satisfy display sizing; values not used for drawing when grouped
        bytes = new Array(0);
      }
    } else {
      // binary mode: interpret value as an integer and show its binary groups (MSB-first)
      const n = BigInt(value);
      bytesCountForUnit = n; // treat as raw bytes count when showing unit

      // convert to binary string
      const bin = n === 0n ? '0' : n.toString(2);
      // pad left to a multiple of 8 for full bytes
      const pad = (8 - (bin.length % 8)) % 8;
      const padded = '0'.repeat(pad) + bin;
      const chunks = [];
      for (let i = 0; i < padded.length; i += 8) chunks.push(padded.slice(i, i + 8));
      // each chunk => array of '0'/'1' characters
      bytes.push(...chunks.map(ch => ch.split('')));
    }
    // (bytes was computed earlier depending on `mode`)

    // Update textual values
    // For bitcount mode show number of bytes derived from bits; for binary mode show the integer in bytes units
    valueUnit.textContent = humanizeBytes(bytesCountForUnit);

    // compute and set sizing classes after grouping decision below (moved)

    // now build or update DOM
    const newBitsFlat = bytes.length ? bytes.flat().join('') : '';
    // determine grouping for bitcount mode: if there are many bytes, show KB blocks
    const useGrouping = mode === 'bitcount' && bytesCountForUnit >= BigInt(GROUP_BYTES);
    // when grouping, build KB groups (each is BITS_PER_GROUP bits, now 8192 bits)
    // when grouping, compute KB groups and fractions without allocating massive arrays
    let kbGroups = null; // array of strings (each length BITS_PER_GROUP) or null when lazily computed
    let kbFractions = null; // per-KB fractions numbers we can use for MB overview.
    if (mode === 'bitcount' && bytesCountForUnit >= BigInt(GROUP_BYTES)) {
      // compute total bits and counts without building the entire bit string
      totalBitsBI = BigInt(bytesCountForUnit) * 8n;
      const totalBitsNumber = Number(totalBitsBI > 9_000_000_000n ? 9_000_000_000 : totalBitsBI);
      groupCount = Math.ceil(Number(totalBitsBI) / BITS_PER_GROUP);
      // precompute per-KB fractions but only when not astronomically huge; cap at a reasonable length
      if (groupCount <= 32768) {
        kbFractions = [];
        for (let gi = 0; gi < groupCount; gi++) {
          const start = BigInt(gi) * BigInt(BITS_PER_GROUP);
          const end = start + BigInt(BITS_PER_GROUP);
          const ones = start >= totalBitsBI ? 0n : (end <= totalBitsBI ? BigInt(BITS_PER_GROUP) : (totalBitsBI - start));
          kbFractions.push(Number(ones) / BITS_PER_GROUP);
        }
      }
      // determine whether we should render at MB level (groups of GROUPS_PER_LEVEL KBs)
      var useMbLevel = groupCount >= GROUPS_PER_LEVEL;
      var mbGroups = null;

      // If the server can help compute summaries for very large inputs (and we
      // are rendering MB-level summaries), fetch the per-KB fraction summary
      // as an optional performance optimization. The server endpoint returns
      // an array of fractions (0..1) indicating how many bits are set in each
      // KB group for the bitcount mode. We use the parameterized version
      // defined further down to keep a single definition.
      if (useMbLevel) {
        mbGroups = [];
        if (kbFractions && kbFractions.length) {
          for (let i = 0; i < kbFractions.length; i += GROUPS_PER_LEVEL) mbGroups.push(kbFractions.slice(i, i + GROUPS_PER_LEVEL));
        }
      }
      // proactively ask server for per-KB fractions for large inputs. This is optional and
      // used to avoid generating long per-KB strings on the client.
      if (useMbLevel && !kbFractions) {
        const tb = Number(totalBitsBI > 9_000_000_000n ? 9_000_000_000n : totalBitsBI);
        tryServerSummary(tb).then((srv) => {
          if (srv && srv.length) kbFractions = srv;
        }).catch(() => {});
      }
    }

    // helper to fetch server-side per-KB summaries for large datasets
    async function tryServerSummary(totalBits) {
      try {
        const res = await fetch('/api/group_summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: String(totalBits), mode: 'bitcount' })
        });
        if (!res.ok) return null;
        const body = await res.json();
        if (body && Array.isArray(body.kb_fractions)) return body.kb_fractions;
      } catch (e) { /* ignore and fallback */ }
      return null;
    }

    // compute display count and sizing after grouping info is available
    let displayCount = 0;
    if (!useGrouping) displayCount = bytes.length;
    else if (useMbLevel) displayCount = (mbGroups && mbGroups.length) ? mbGroups.length : Math.ceil((kbFractions ? kbFractions.length : groupCount) / GROUPS_PER_LEVEL);
    else displayCount = kbFractions ? kbFractions.length : groupCount;
    adjustSizing(displayCount, useGrouping);
    // if we already rendered something, capture the current bit string so we can
    // decide whether a full rebuild is needed (length differs) or we can update in-place
    const currentBitsFlat = bitField.dataset.rendered ? Array.from(bitField.querySelectorAll('.bit, .cell')).map(b => b.dataset.value || '0').join('') : null;
    // If we're grouping, we'll render groups (kbGroups) instead of individual bytes
    // if we're asked to render many items (bytes or groups), show a loader and render asynchronously
    // totalCells used to determine heavy / chunking: number of bits being represented
    let totalCells;
    if (!useGrouping) totalCells = bytes.length * 8;
    else totalCells = (kbFractions ? kbFractions.length : groupCount) * BITS_PER_GROUP;
    const loader = document.getElementById('loader');
    const heavyThreshold = 180; // number of byte groups considered heavy to render
    // chunkedThreshold & chunkSize are defined at top-level
    if (!render.__token) render.__token = 0; // token to cancel in-progress chunking
    const myToken = ++render.__token;

    // Always render data (possibly via chunked renderer) so
    // the app shows visual output for all inputs.
    if (bitField.dataset.expanded) delete bitField.dataset.expanded;

    function renderDom() {
      // if no existing nodes, render fresh
      if (!bitField.dataset.rendered) {
        bitField.innerHTML = '';
        // If chunking will be used, skip appending here and delegate to the chunked path below.
        // Otherwise, append all bytes at once (fast path for smaller renders).
        // helper to append a single byte DOM
        const appendByte = (b, idx) => {
          const byteEl = document.createElement('div');
          byteEl.className = 'byte';
          byteEl.dataset.byteIndex = idx;
          // show bits left->right
          const row = document.createElement('div');
          row.className = 'row';
          b.forEach((bit, bi) => {
            const el = document.createElement('div');
            el.className = 'bit off';
            el.dataset.bitIndex = bi;
            el.dataset.value = bit;
            row.appendChild(el);
          });
          const title = document.createElement('div');
          title.className = 'byte-title';
          // show byte index left-to-right with the first grid being byte 0 (LSB)
          title.textContent = mode === 'bitcount' ? `byte group ${idx}` : `binary group ${idx}`;
          byteEl.appendChild(row);
          byteEl.appendChild(title);
          bitField.appendChild(byteEl);
        };

      // helper to draw a single KB group on canvas (128×64 pixels, 8192 bits)
      // Use ImageData (faster) for per-pixel drawing. If chunkBits is a number (fraction) we draw a single color fill
      const drawKbBlock = (canvas, chunkBitsOrFrac, animate = false) => {
          const cols = 128;
          const rows = 64;
          const pixelSize = 1; // 1 pixel per bit
          const ctx = canvas.getContext('2d');
          canvas.width = cols * pixelSize;
          canvas.height = rows * pixelSize;
          // clear background
          ctx.fillStyle = 'rgba(0,0,0,1)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          if (typeof chunkBitsOrFrac === 'number') {
            const frac = Math.max(0, Math.min(1, chunkBitsOrFrac));
            if (frac <= 0) return;
            const alpha = 0.04 + frac * 0.9;
            ctx.fillStyle = `rgba(0,255,120,${alpha})`;
            if (!animate) {
              ctx.fillRect(0, 0, cols * pixelSize, rows * pixelSize);
            } else {
              // animate fill across rows
              let rstart = 0;
              const tile = 8;
              const step = () => {
                const h = Math.min(tile, rows - rstart);
                ctx.fillRect(0, rstart, cols * pixelSize, h * pixelSize);
                rstart += tile;
                if (rstart < rows) requestAnimationFrame(step);
              };
              requestAnimationFrame(step);
            }
            return;
          }

          const chunkBits = chunkBitsOrFrac;
          // bit-by-bit building of ImageData for the whole KB
          const id = ctx.createImageData(cols, rows);
          const data = id.data; // Uint8ClampedArray
          // precomputed color
          const r = 0, g = 255, bcol = 153, a = 255;
          for (let i = 0; i < BITS_PER_GROUP; i++) {
            if (chunkBits[i] === '1') {
              const row = Math.floor(i / cols);
              const col = i % cols;
              const pidx = (row * cols + col) * 4;
              data[pidx] = r;
              data[pidx + 1] = g;
              data[pidx + 2] = bcol;
              data[pidx + 3] = a;
            }
          }
          if (!animate) {
            ctx.putImageData(id, 0, 0);
          } else {
            // Reveal the KB canvas in row-chunks to give a granular build-up.
            const tile = 8; // rows per animation step
            let rowStart = 0;
            const step = () => {
              const h = Math.min(tile, rows - rowStart);
              ctx.putImageData(id, 0, 0, 0, rowStart, cols, h);
              rowStart += tile;
              if (rowStart < rows) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          }
        };

        // helper to append a single KB group as a canvas element
        const appendKb = (chunkBitsOrFrac, idx, animate = false) => {
          const el = document.createElement('div');
          el.className = 'kb-block';
          el.dataset.kbIndex = idx;
          const canvas = document.createElement('canvas');
          canvas.className = 'kb-canvas';
          canvas.dataset.kbIndex = idx;
          drawKbBlock(canvas, chunkBitsOrFrac, animate);
          const title = document.createElement('div');
          title.className = 'kb-title';
          title.textContent = `KB ${idx}`;
          el.appendChild(canvas);
          el.appendChild(title);
          bitField.appendChild(el);
        };

        // helper to draw an MB block as a 32x32 canvas where each pixel represents a KB
        const drawMbBlock = (canvas, mbArray) => {
          const cols = 32;
          const rows = 32; // 32*32 = 1024 KB tiles per MB
          const ctx = canvas.getContext('2d');
          canvas.width = cols;
          canvas.height = rows;
          // clear and paint background
          ctx.fillStyle = 'rgba(0,0,0,1)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          // draw each KB entry as one pixel
          for (let i = 0; i < Math.min(mbArray.length, cols * rows); i++) {
            const v = mbArray[i];
            let frac = 0;
            if (typeof v === 'string') {
              // if strings are present, compute ones more efficiently with a loop rather than regex
              let ones = 0;
              for (let j = 0; j < v.length; j++) if (v[j] === '1') ones++;
              frac = ones / BITS_PER_GROUP;
            } else if (typeof v === 'number') {
              frac = v;
            }
            if (frac > 0) {
              const alpha = 0.04 + frac * 0.9;
              ctx.fillStyle = `rgba(0,255,120,${alpha})`;
              const row = Math.floor(i / cols);
              const col = i % cols;
              ctx.fillRect(col, row, 1, 1);
            }
          }
        };

        // helper to append an MB group DOM (collection of GROUPS_PER_LEVEL KB tiles)
        const appendMb = (mbArray, idx) => {
          const mbEl = document.createElement('div');
          mbEl.className = 'mb-block';
          mbEl.dataset.mbIndex = idx;
          const canvas = document.createElement('canvas');
          canvas.className = 'mb-canvas';
          canvas.dataset.mbIndex = idx;
          drawMbBlock(canvas, mbArray);
          const title = document.createElement('div');
          title.className = 'mb-title';
          title.textContent = `MB ${idx}`;
          mbEl.appendChild(canvas);
          mbEl.appendChild(title);
          bitField.appendChild(mbEl);
          // animate the canvas fade-in
          canvas.style.opacity = '0';
          setTimeout(() => { canvas.style.transition = 'opacity 280ms ease'; canvas.style.opacity = '1'; }, 12);
        };

        // Try server summary fetch separately — this helper only makes the network call

        if (useGrouping) {
          // determine MB-level grouping (each MB = GROUPS_PER_LEVEL KB groups)
          const groupCount = (kbFractions && kbFractions.length) ? kbFractions.length : Math.ceil((Number((BigInt(bytesCountForUnit) * 8n) > 9_000_000_000n ? 9_000_000_000 : Number(bytesCountForUnit) * 8) || 0) / BITS_PER_GROUP);
          const useMbLevel = groupCount >= GROUPS_PER_LEVEL;
          if (!useMbLevel) {
            // append KB groups directly when not chunking
            if (totalCells < CHUNK_CELL_THRESHOLD) {
              for (let i = 0; i < groupCount; i++) {
                if (kbFractions) appendKb(kbFractions[i], i, true);
                else {
                  const start = BigInt(i) * BigInt(BITS_PER_GROUP);
                  const end = start + BigInt(BITS_PER_GROUP);
                  const ones = start >= totalBitsBI ? 0n : (end <= totalBitsBI ? BigInt(BITS_PER_GROUP) : (totalBitsBI - start));
                  const frac = Number(ones) / BITS_PER_GROUP;
                  appendKb(frac, i, true);
                }
              }
            }
          } else {
            // build MB groups (each MB contains up to GROUPS_PER_LEVEL KB groups)
            const mbGroups = [];
            if (kbFractions) {
              for (let i = 0; i < kbFractions.length; i += GROUPS_PER_LEVEL) mbGroups.push(kbFractions.slice(i, i + GROUPS_PER_LEVEL));
            } else {
              // try server summary; otherwise fallback to building per-KB strings (only done for small datasets)
              // we compute a best-effort totalBits number for the server
              const totalBits = Number(BigInt(bytesCountForUnit) * 8n > 9_000_000_000n ? 9_000_000_000n : BigInt(bytesCountForUnit) * 8n);
              tryServerSummary(totalBits).then((srvKb) => {
                if (srvKb && srvKb.length) {
                  for (let i = 0; i < srvKb.length; i += GROUPS_PER_LEVEL) mbGroups.push(srvKb.slice(i, i + GROUPS_PER_LEVEL));
                  if (totalCells < CHUNK_CELL_THRESHOLD) mbGroups.forEach((mbf, mIdx) => appendMb(mbf, mIdx));
                } else if (totalCells < CHUNK_CELL_THRESHOLD) {
                  for (let i = 0; i < groupCount; i += GROUPS_PER_LEVEL) {
                    const start = i;
                    const sub = [];
                    for (let j = start; j < Math.min(groupCount, start + GROUPS_PER_LEVEL); j++) {
                      const s = BigInt(j) * BigInt(BITS_PER_GROUP);
                      const e = s + BigInt(BITS_PER_GROUP);
                      const ones = s >= totalBitsBI ? 0n : (e <= totalBitsBI ? BigInt(BITS_PER_GROUP) : (totalBitsBI - s));
                      sub.push(Number(ones) / BITS_PER_GROUP);
                    }
                    mbGroups.push(sub);
                  }
                  mbGroups.forEach((mb, mIdx) => appendMb(mb, mIdx));
                }
              }).catch(() => {
                if (totalCells < CHUNK_CELL_THRESHOLD) {
                  for (let i = 0; i < groupCount; i += GROUPS_PER_LEVEL) {
                    const start = i;
                    const sub = [];
                    for (let j = start; j < Math.min(groupCount, start + GROUPS_PER_LEVEL); j++) {
                      const s = BigInt(j) * BigInt(BITS_PER_GROUP);
                      const e = s + BigInt(BITS_PER_GROUP);
                      const ones = s >= totalBitsBI ? 0n : (e <= totalBitsBI ? BigInt(BITS_PER_GROUP) : (totalBitsBI - s));
                      sub.push(Number(ones) / BITS_PER_GROUP);
                    }
                    mbGroups.push(sub);
                  }
                  mbGroups.forEach((mb, mIdx) => appendMb(mb, mIdx));
                }
              });
            }
          }
        } else if (totalCells < CHUNK_CELL_THRESHOLD) {
          bytes.forEach((b, idx) => {
            const byteEl = document.createElement('div');
            byteEl.className = 'byte';
            byteEl.dataset.byteIndex = idx;
            // show bits left->right
            const row = document.createElement('div');
            row.className = 'row';
            b.forEach((bit, bi) => {
              const el = document.createElement('div');
              el.className = 'bit off';
              el.dataset.bitIndex = bi;
              el.dataset.value = bit;
              row.appendChild(el);
            });
            const title = document.createElement('div');
            title.className = 'byte-title';
            // show byte index left-to-right with the first grid being byte 0 (LSB)
            title.textContent = mode === 'bitcount' ? `byte group ${idx}` : `binary group ${idx}`;
            byteEl.appendChild(row);
            byteEl.appendChild(title);
            bitField.appendChild(byteEl);
          });
        }

        // chunked rendering for very large counts / groups
        // decide effective chunk size depending on grouping and level
        let effectiveChunkSize;
        let totalItems;
        if (!useGrouping) {
          totalItems = bytes.length;
        } else if (useMbLevel) {
          totalItems = (typeof mbGroups !== 'undefined' && mbGroups && mbGroups.length) ? mbGroups.length : Math.ceil(groupCount / GROUPS_PER_LEVEL);
        } else {
          totalItems = (kbFractions && kbFractions.length) ? kbFractions.length : groupCount;
        }
        if (useGrouping) {
          effectiveChunkSize = useMbLevel ? 2 : 8; // add only a few KBs or MBs per chunk
        } else {
          effectiveChunkSize = chunkSize;
        }
        if (totalCells >= CHUNK_CELL_THRESHOLD) {
          bitField.innerHTML = '';
          let appended = 0;
          let chunkIdx = 0;
          const totalChunks = Math.ceil(totalItems / effectiveChunkSize);

          const appendChunk = () => {
            if (render.__token !== myToken) return; // aborted
            const start = chunkIdx * effectiveChunkSize;
            const end = Math.min(totalItems, start + effectiveChunkSize);
            for (let idx = start; idx < end; idx++) {
              if (useGrouping) {
                if (useMbLevel) {
                  if (mbGroups && mbGroups[idx]) appendMb(mbGroups[idx], idx);
                  else {
                    // need to build on-demand
                    const baseIdx = idx * GROUPS_PER_LEVEL;
                    const arr = [];
                    for (let j = baseIdx; j < Math.min(groupCount, baseIdx + GROUPS_PER_LEVEL); j++) {
                      if (kbFractions) arr.push(kbFractions[j]);
                      else {
                        const s = BigInt(j) * BigInt(BITS_PER_GROUP);
                        const e = s + BigInt(BITS_PER_GROUP);
                        const ones = s >= totalBitsBI ? 0n : (e <= totalBitsBI ? BigInt(BITS_PER_GROUP) : (totalBitsBI - s));
                        arr.push(Number(ones) / BITS_PER_GROUP);
                      }
                    }
                    appendMb(arr, idx);
                  }
                } else {
                  if (kbFractions) appendKb(kbFractions[idx], idx, true);
                  else {
                    const s = BigInt(idx) * BigInt(BITS_PER_GROUP);
                    const e = s + BigInt(BITS_PER_GROUP);
                    const ones = s >= totalBitsBI ? 0n : (e <= totalBitsBI ? BigInt(BITS_PER_GROUP) : (totalBitsBI - s));
                    appendKb(Number(ones) / BITS_PER_GROUP, idx, true);
                  }
                }
              } else {
                appendByte(bytes[idx], idx);
              }
            }
            appended += (end - start);
            chunkIdx++;
            if (loader) loader.querySelector('.loader-label').textContent = `Rendering… ${Math.round(appended / totalItems * 100)}%`;

            // animate the freshly added slice using a small, quick animation window
            // for chunked append animate the newly added nodes
            if (useGrouping) {
              if (useMbLevel) {
                const canvases = Array.from(bitField.querySelectorAll('.mb-canvas')).slice(start, end);
                if (canvases.length) canvases.forEach(c => { c.style.opacity = '0'; setTimeout(() => c.style.opacity = '1', 6); });
              } else {
                // KB-level canvas animations use per-row reveal inside drawKbBlock; no additional opacity animation needed.
                // Keep a very short no-op to preserve timing.
                const canvases = Array.from(bitField.querySelectorAll('.kb-canvas')).slice(start, end);
                if (canvases.length) canvases.forEach(c => { /* no-op: per-row animation is handled on draw */ });
              }
            } else {
              const sliceStart = start * 8;
              const sliceEnd = end * 8;
              const sliceNodes = Array.from(bitField.querySelectorAll('.bit, .cell')).slice(sliceStart, sliceEnd);
              if (sliceNodes.length) animateNodesQuick(sliceNodes, 6, 2);
            }

            if (end < totalItems) {
              setTimeout(appendChunk, 12);
            } else {
              // finished
              bitField.dataset.rendered = 'true';
              lastBits = Array.from(bitField.querySelectorAll('.bit, .cell')).map(n => n.dataset.value || '0');
              if (loader) { loader.classList.add('hidden'); loader.setAttribute('aria-hidden', 'true'); }
            }
          };

          setTimeout(appendChunk, 24);
          return;
        }

        // default non-chunked behavior
        bitField.dataset.rendered = 'true';
        // animate initial state
        lastBits = newBitsFlat.split('');
        staggerUpdate(lastBits, {});
        if (loader) { loader.classList.add('hidden'); loader.setAttribute('aria-hidden', 'true'); }
        return;
      }
    };

    // Decide how to schedule rendering
    if (totalCells >= CHUNK_CELL_THRESHOLD) {
      // if we already have the DOM and the flat bit length matches, this is an in-place update
      if (bitField.dataset.rendered && currentBitsFlat !== null && currentBitsFlat.length === newBitsFlat.length) {
        // update element dataset values and animate differences
        const newBitsArr = newBitsFlat.split('');
        const prevBitsArr = Array.from(bitField.querySelectorAll('.bit, .cell')).map(b => b.dataset.value || '0');
        const nodes = Array.from(bitField.querySelectorAll('.bit, .cell'));
        nodes.forEach((el, i) => { el.dataset.value = newBitsArr[i]; });
        staggerUpdate(newBitsArr, { prev: prevBitsArr });
        lastBits = newBitsArr.slice();
        return;
      }

      // otherwise we need to rebuild using chunked rendering — show loader and start render
      if (loader) { loader.classList.remove('hidden'); loader.setAttribute('aria-hidden', 'false'); loader.querySelector('.loader-label').textContent = 'Rendering… 0%'; }
      // clear any prior rendered flag so renderDom will construct fresh
      delete bitField.dataset.rendered;
      renderDom();
      return;
    }

    // if it's heavy but not chunked, try to update in-place when possible, otherwise rebuild
    if (bytes.length >= heavyThreshold) {
      if (bitField.dataset.rendered && currentBitsFlat !== null && currentBitsFlat.length === newBitsFlat.length) {
        // same structure, just update values
        const newBitsArr = newBitsFlat.split('');
        const prevBitsArr = Array.from(bitField.querySelectorAll('.bit, .cell')).map(b => b.dataset.value || '0');
        const nodes = Array.from(bitField.querySelectorAll('.bit, .cell'));
        nodes.forEach((el, i) => { el.dataset.value = newBitsArr[i]; });
        staggerUpdate(newBitsArr, { prev: prevBitsArr });
        lastBits = newBitsArr.slice();
        return;
      }

      if (loader) { loader.classList.remove('hidden'); loader.setAttribute('aria-hidden', 'false'); }
      // clear any prior rendered flag so renderDom will construct fresh
      delete bitField.dataset.rendered;
      setTimeout(renderDom, 30);
      return;
    }

    // if not heavy, render synchronously
    if (!bitField.dataset.rendered) {
      renderDom();
      return;
    }

    // Compare existing bits and animate changes
    // If length differs, re-render structure for simplicity
    if (currentBitsFlat.length !== newBitsFlat.length) {
      bitField.innerHTML = '';
      delete bitField.dataset.rendered;
      // recursively call to re-render
      render(value);
      return;
    }

    // otherwise animate differences
    const newBitsArr = newBitsFlat.split('');
    const prevBitsArr = Array.from(bitField.querySelectorAll('.bit, .cell')).map(b => b.dataset.value || '0');

    // update element dataset values and animate on/off
    const nodes = Array.from(bitField.querySelectorAll('.bit, .cell'));
    nodes.forEach((el, i) => {
      el.dataset.value = newBitsArr[i];
    });

    staggerUpdate(newBitsArr, { prev: prevBitsArr });
    lastBits = newBitsArr.slice();
  }

  // Lazily build a 8192-bit (KB) string for the given KB index when necessary.
  function buildKbChunkString(totalBitsBI, gi) {
    const start = BigInt(gi) * BigInt(BITS_PER_GROUP);
    const end = start + BigInt(BITS_PER_GROUP);
    const ones = start >= totalBitsBI ? 0n : (end <= totalBitsBI ? BigInt(BITS_PER_GROUP) : (totalBitsBI - start));
    const onesNum = Number(ones);
    if (onesNum <= 0) return '0'.repeat(BITS_PER_GROUP);
    if (onesNum >= BITS_PER_GROUP) return '1'.repeat(BITS_PER_GROUP);
    // place ones at the left for nicer visual fill (MSB side)
    return '1'.repeat(onesNum).padEnd(BITS_PER_GROUP, '0');
  }

  // wire cancel button to abort long renders
  const cancelBtn = document.getElementById('cancel-render');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (!render.__token) render.__token = 0;
      // increment token to cancel any in-progress chunking
      render.__token++;
      // hide loader
      if (loader) { loader.classList.add('hidden'); loader.setAttribute('aria-hidden', 'true'); }
      // provide some visual feedback in the loader label
      if (loader) {
        const groupsRendered = bitField.querySelectorAll('.byte, .kb-block, .mb-block').length;
        loader.querySelector('.loader-label').textContent = `Render cancelled — ${groupsRendered.toLocaleString()} groups rendered`;
        // keep the message briefly visible, then hide loader
        setTimeout(() => { loader.classList.add('hidden'); loader.setAttribute('aria-hidden', 'true'); }, 900);
      }
    });
  }

  // wire the mobile step buttons
  document.querySelectorAll('.step-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const el = e.currentTarget;
      const step = BigInt(Number(el.getAttribute('data-step') || '1'));
      const action = el.getAttribute('data-action');
      const current = parseNumber(numberInput.value || '0');
      let next = action === 'decrement' ? current - step : current + step;
      if (next < 0n) next = 0n;
      numberInput.value = next.toString();
      render(next);
    });
  });

  function staggerUpdate(newBits, { prev = [] } = {}) {
    const nodes = Array.from(bitField.querySelectorAll('.bit, .cell'));
    const currentByteGroups = Math.ceil(nodes.length / 8);

    // If we are showing many byte groups, disable per-bit staggered animations
    // and just apply classes directly for performance.
    if (currentByteGroups >= NO_ANIM_BYTE_GROUPS) {
      bitField.classList.add('no-anim');
      nodes.forEach((el, i) => {
        const shouldOn = newBits[i] === '1';
        if (shouldOn) { el.classList.add('on'); el.classList.remove('off'); }
        else { el.classList.add('off'); el.classList.remove('on'); }
        el.dataset.value = newBits[i];
      });
      return;
    }
    // otherwise ensure no-anim removed
    bitField.classList.remove('no-anim');
    const n = nodes.length || 1;
    // pick a total animation window (ms). For many nodes, keep this reasonable so per-bit delay is small.
    const totalWindow = 700; // ms
    const perBitDelay = Math.max(2, Math.floor(totalWindow / n));
    // animation duration for each dot transitions should be smaller when there are many nodes
    const bitTransitionMs = Math.max(40, Math.floor(350 * Math.min(1, 256 / n)));
    bitField.style.setProperty('--bit-transition', `${bitTransitionMs}ms`);
    // determine random-ish delays but stable order: light up left-to-right, top-to-bottom
    nodes.forEach((el, i) => {
      const shouldOn = newBits[i] === '1';
      const wasOn = prev[i] === '1';
      // determine delay
      const delay = i * perBitDelay;
      setTimeout(() => {
        if (shouldOn && !wasOn) {
          el.classList.remove('off');
          el.classList.add('on');
        } else if (!shouldOn && wasOn) {
          // turning off uses a slightly different animation cadence
          el.classList.remove('on');
          el.classList.add('off');
        } else {
          // no change, ensure classes match
          if (shouldOn) { el.classList.add('on'); el.classList.remove('off'); }
          else { el.classList.add('off'); el.classList.remove('on'); }
        }
      }, delay);
    });
  }

  // Animate a specific list of existing DOM bit nodes quickly (used for chunked rendering)
  function animateNodesQuick(bitEls, startDelay = 0, perDelay = 4) {
    const quickNoAnim = Math.ceil(bitEls.length / 8) >= NO_ANIM_BYTE_GROUPS || bitField.classList.contains('no-anim');
    bitEls.forEach((el, i) => {
      const shouldOn = (el.dataset.value || '0') === '1';
      if (quickNoAnim) {
        // directly apply final state for performance
        if (shouldOn) { el.classList.add('on'); el.classList.remove('off'); }
        else { el.classList.add('off'); el.classList.remove('on'); }
      } else {
        setTimeout(() => {
          if (shouldOn) { el.classList.add('on'); el.classList.remove('off'); }
          else { el.classList.add('off'); el.classList.remove('on'); }
        }, startDelay + (i * perDelay));
      }
    });
  }

  function adjustSizing(byteCount, isGrouped = false) {
    // decide how cramped it is. Measure container width and estimated byte width.
    const wrap = document.getElementById('bitField-wrap');
    const containerW = wrap.clientWidth || wrap.getBoundingClientRect().width;
    const computed = getComputedStyle(document.documentElement);
    const circle = parseFloat(computed.getPropertyValue('--circle-size')) || 36;
    const gap = parseFloat(computed.getPropertyValue('--gap')) || 10;
    // rough estimate: each byte has 8 bits + padding, but bits arranged in single row; each bit width + gaps
    let byteWidth;
    if (isGrouped) {
      // approximate KB-block width (matches .kb-grid width + container padding)
      byteWidth = 260 + 24; // grid + some padding
    } else {
      byteWidth = (circle * 8) + (7 * 6) + 40; // bit sizes + spacing + padding approx
    }
    const totalWidth = byteCount * byteWidth;

    bitField.classList.remove('small', 'smaller', 'tiny', 'tinier', 'scaled');

    // We need to scale the circles to fit the available width. Compute a scale factor.
    // Keep a margin so things don't touch the edges.
    const scale = Math.max(0.2, Math.min(1, (containerW * 0.85) / totalWidth));
    const newCircle = Math.max(6, Math.floor(circle * scale));
    bitField.style.setProperty('--circle-size', `${newCircle}px`);
    bitField.classList.add('scaled');
    // Also shrink a bit when very crowded
    if (byteCount > 32) bitField.classList.add('small');
    if (byteCount > 64) bitField.classList.add('smaller');
  }

  // throttle input handling slightly
  let timeoutId = null;
  numberInput.addEventListener('input', () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      const n = parseNumber(numberInput.value);
      render(n);
    }, 140);
  });

  // keyboard stepper: arrow keys increment/decrement the numeric input
  // - ArrowUp / ArrowDown change value by 1
  // - Shift + Arrow -> change by 10
  // - Ctrl  + Arrow -> change by 100
  // - Alt   + Arrow -> change by 1000
  numberInput.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    // stop native cursor movement / selection changes
    e.preventDefault();

    // modifier precedence: Alt (1000) > Ctrl (100) > Shift (10) > none (1)
    const step = e.altKey ? 1000n : (e.ctrlKey ? 100n : (e.shiftKey ? 10n : 1n));
    const dir = e.key === 'ArrowUp' ? 1n : -1n;

    const current = parseNumber(numberInput.value || '0');
    let next = current + (step * dir);
    if (next < 0n) next = 0n;
    numberInput.value = next.toString();
    render(next);
  });

  // when user switches modes update the label and re-render
  if (modeSelect) {
    modeSelect.addEventListener('change', (e) => {
      mode = e.target.value;
      if (inputLabel) {
        inputLabel.textContent = mode === 'bitcount' ? 'Enter bit count' : 'Enter integer';
        numberInput.value = '255';
        numberInput.focus();
      }
      // re-render with the new input interpretation
      const n = parseNumber(numberInput.value);
      render(n);
    });
  }

  // initial render
  render(0n);

  // make field accept big numbers via ctrl+v paste
  numberInput.addEventListener('paste', (e) => {
    // allow paste
    setTimeout(() => { numberInput.dispatchEvent(new Event('input')); }, 1);
  });
})();
