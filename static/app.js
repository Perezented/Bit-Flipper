(() => {
  const numberInput = document.getElementById('number-input');
  const bitField = document.getElementById('bitField');
  const valueUnit = document.getElementById('value-unit');
  const valueUnitGB = document.getElementById('value-unit-gb');
  const modeSelect = document.getElementById('mode');
  const unitSelect = document.getElementById('unit-select');
  const loader = document.getElementById('loader');

  const chunkSize = 512; // groups per chunk when chunking (for byte-level)
  const CHUNK_CELL_THRESHOLD = 100000; // total bit cells to trigger chunked rendering
  const NO_ANIM_BYTE_GROUPS = 128; // disable per-bit animation above this many byte groups

  const inputLabel = document.getElementById('input-label');

  // Feature gate for render debugging (use query param `?DEBUG_RENDER=true`,
  // sessionStorage or `window.DEBUG_RENDER = true` to enable)
  const DEBUG_RENDER = (function() {
    try {
      const url = (typeof window !== 'undefined' && window.location && window.location.search) ? window.location.search : '';
      const params = new URLSearchParams(url);
      const q = params.get('DEBUG_RENDER');
      return Boolean(q === '1' || q === 'true' || (typeof window !== 'undefined' && (window.DEBUG_RENDER === true || window.DEBUG_RENDER === 'true') || sessionStorage.getItem('DEBUG_RENDER') === 'true'));
    } catch (e) {
      return false;
    }
  })();

  // default mode: "binary" (treat input as a number of bits and show bytes)
  let mode = modeSelect?.value || 'binary';
  // default unit: bits, used only in `bitcount` mode
  let unit = unitSelect?.value || 'bits';
  // Reflect initial unitSelect visibility according to mode
  if (unitSelect && unitSelect.parentElement) {
    const hide = (mode !== 'bitcount');
    unitSelect.parentElement.hidden = hide;
    // Fallback: ensure display none if hidden doesn't take effect due to CSS
    unitSelect.parentElement.style.display = hide ? 'none' : '';
    if (DEBUG_RENDER) console.log('ui-init-unit', { mode, hidden: hide, parentClass: unitSelect.parentElement.className });
  }

  // Keep last bits to animate differences
  let lastBits = [];

  // Input constraints
  const BITCOUNT_MAX_LEN = 42; // maximum characters allowed when in bitcount mode
  const BINARY_MAX_LEN = 90; // maximum characters allowed when in binary mode

  function getMaxLenForMode(m) {
    return m === 'bitcount' ? BITCOUNT_MAX_LEN : BINARY_MAX_LEN;
  }

  function applyModeMaxLength() {
    try {
      if (!numberInput) return;
      const max = getMaxLenForMode(mode);
      numberInput.maxLength = max;
      // Truncate current value if necessary
      if (numberInput.value && numberInput.value.length > max) {
        numberInput.value = numberInput.value.slice(0, max);
      }
    } catch (e) { /* ignore */ }
  }
  // set initial input max length based on starting mode
  applyModeMaxLength();

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

  const UNIT_TO_BITS = {
    bits: 1n,
    bytes: 8n,
    KB: 8192n, // 1024 bytes * 8
    MB: 8192n * 1024n,
    GB: 8192n * 1024n * 1024n,
    TB: 8192n * 1024n * 1024n * 1024n,
    PB: 8192n * 1024n * 1024n * 1024n * 1024n,
    EB: 8192n * 1024n * 1024n * 1024n * 1024n * 1024n,
    ZB: 8192n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n,
    YB: 8192n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n,
    BB: 8192n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n,
    NB: 8192n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n,
    DB: 8192n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n,
    QB: 8192n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n,
    OB: 8192n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n * 1024n
  };

  // Single `humanizeBytes` implementation that handles Numbers and BigInts.
  function humanizeBytes(bytes) {
    const units = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB', 'BB', 'NB', 'DB', 'QB', 'OB'];
    // Helper to format a float with up to two decimals, dropping .00
    const fmt = (v) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));

    if (typeof bytes === 'bigint') {
      // Convert BigInt to the largest possible unit without losing precision
      let b = bytes;
      let i = 0;
      while (b >= 1024n && i < units.length - 1) {
        b = b / 1024n;
        i++;
      }
      // If the resulting integer value is large enough (no decimal needed), return integer
      if (b > 900n || i === units.length - 1) return `${String(b)} ${units[i]}`;
      // Else convert to number and fall-through to numeric formatting
      const bn = Number(bytes);
      let d = bn;
      let j = 0;
      while (d >= 1024 && j < units.length - 1) { d /= 1024; j++; }
      return `${fmt(d)} ${units[j]}`;
    }

    // numeric fallback
    const n = Number(bytes || 0);
    let v = n;
    let ui = 0;
    while (v >= 1024 && ui < units.length - 1) { v /= 1024; ui++; }
    return `${fmt(v)} ${units[ui]}`;
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
    try { if (DEBUG_RENDER) console.log('render-start', { mode, inputValue: numberInput ? numberInput.value : null, value: String(value) }); } catch (e) { }
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
    // Level grouping defaults (0 = KB)
    let levelIndex = 0;
    let groupsAtLevel = 0;

    if (mode === 'bitcount') {
      // interpret `value` as a bit count
      const totalBits = BigInt(value);
      try { if (DEBUG_RENDER) console.log('render-bitcount', { totalBits: String(totalBits), fullBytes: String(totalBits / 8n) }); } catch (e) { }
      const fullBytes = totalBits / 8n; // BigInt
      const remainder = Number(totalBits % 8n);
      bytesCountForUnit = fullBytes;

      // If we are in the grouped case, avoid creating many full arrays of bits
      // — instead compute group counts/fractions and lazily build data only for canvases we'll render.
      const useGrouping = fullBytes >= BigInt(GROUP_BYTES);
      // Determine if we need to append KB or MB groups based on the level index
      if (!useGrouping) {
        // small: build per-byte arrays as before
        for (let i = 0n; i < fullBytes; i++) bytes.push(Array(8).fill('1'));
        if (remainder > 0) {
          const partial = Array(8).fill('0');
          for (let i = 0; i < remainder; i++) partial[i] = '1';
          bytes.push(partial);
        }
        if (bytes.length === 0) bytes.push(Array(8).fill('0'));
        try { if (DEBUG_RENDER) console.debug('render-small', { fullBytes: String(fullBytes), remainder, bytesLen: bytes.length }); } catch (e) { }
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
      valueUnitGB.textContent = '';
      try { if (DEBUG_RENDER) console.log('render-binary', { n: String(n), binLen: (n === 0n ? 1 : n.toString(2).length) }); } catch (e) { }
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
    const convertBitCountToMB = (bits) => Number(bits) / 8192 / 1024;
    const convertBitCountToGB = (bits) => Number(bits) / 8192 / 1024 / 1024;
    valueUnitGB.textContent = Number(numberInput.value) >= 8388608 ? convertBitCountToGB(numberInput.value) + ' GB' : convertBitCountToMB(numberInput.value) + ' MB';
    // compute and set sizing classes after grouping decision below (moved)

    // now build or update DOM
    const newBitsFlat = bytes.length ? bytes.flat().join('') : '';
    // determine grouping for bitcount mode: if there are many bytes, show KB blocks
    const useGrouping = mode === 'bitcount' && bytesCountForUnit >= BigInt(GROUP_BYTES);
    // when grouping, build KB groups (each is BITS_PER_GROUP bits, now 8192 bits)
    // when grouping, compute KB groups and fractions without allocating massive arrays
    let kbGroups = null; // array of strings (each length BITS_PER_GROUP) or null when lazily computed
    let kbFractions = null; // per-KB fractions numbers we can use for MB overview.
    // per-level groups and fractions (let so we don't overwrite them later)
    let mbGroups = null, gbGroups = null, tbGroups = null, pbGroups = null, ebGroups = null, zbGroups = null, ybGroups = null, bbGroups = null, nbGroups = null, dbGroups = null, qbGroups = null, obGroups = null;
    let mbFractions = null, gbFractions = null, tbFractions = null, pbFractions = null, ebFractions = null, zbFractions = null, ybFractions = null, bbFractions = null, nbFractions = null, dbFractions = null, qbFractions = null, obFractions = null;
    if (mode === 'bitcount' && bytesCountForUnit >= BigInt(GROUP_BYTES)) {
      // compute total bits and counts without building the entire bit string
      totalBitsBI = BigInt(bytesCountForUnit) * 8n;
      const totalBitsNumber = Number(totalBitsBI > 9_000_000_000n ? 9_000_000_000 : totalBitsBI);
      groupCount = Math.ceil(Number(totalBitsBI) / BITS_PER_GROUP);
      // Determine highest grouping level to render based on groupCount
      // levelIndex: 0 = KB, 1 = MB, 2 = GB, 3 = TB, 4 = PB, 5 = EB, 6 = ZB, 7 = YB, 8 = BB, 9 = NB, 10 = DB, 11 = QB, 12 = OB
      const LEVEL_NAMES = ['KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB', 'BB', 'NB', 'DB', 'QB', 'OB'];
      levelIndex = 0;
      groupsAtLevel = groupCount; // effective groups count at currently chosen level
      while (groupsAtLevel >= GROUPS_PER_LEVEL && levelIndex < LEVEL_NAMES.length - 1) {
        groupsAtLevel = Math.ceil(groupsAtLevel / GROUPS_PER_LEVEL);
        levelIndex++;
      }
      // precompute per-KB fractions but only when not astronomically huge; cap at a reasonable length
      if (groupCount <= 32768) {
        kbFractions = [];
        for (let gi = 0; gi < groupCount; gi++) {
          const start = BigInt(gi) * BigInt(BITS_PER_GROUP);
          const end = start + BigInt(BITS_PER_GROUP);
          const ones = start >= totalBitsBI ? 0n : (end <= totalBitsBI ? BigInt(BITS_PER_GROUP) : (totalBitsBI - start));
          kbFractions.push(Number(ones) / BITS_PER_GROUP);
        }
        // Build per-level aggregated fractions and groups up to the selected level
        const perLevelFractions = [];
        const perLevelGroups = [];
        perLevelFractions[0] = kbFractions;
        // chunk function
        const chunkArray = (arr, size) => {
          const out = [];
          for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
          return out;
        };
        // aggregate function (average)
        const aggregateArray = (arr, size) => {
          const out = [];
          for (let i = 0; i < arr.length; i += size) {
            const slice = arr.slice(i, i + size);
            const sum = slice.reduce((a, b) => a + b, 0);
            out.push(sum / slice.length);
          }
          return out;
        };
        for (let li = 1; li <= levelIndex; li++) {
          // groups at level li are chunked from perLevelFractions[li-1]
          perLevelGroups[li] = chunkArray(perLevelFractions[li - 1], GROUPS_PER_LEVEL);
          // aggregated fractions for level li are average of chunks
          perLevelFractions[li] = aggregateArray(perLevelFractions[li - 1], GROUPS_PER_LEVEL);
        }
        // expose mbGroups for compatibility
        if (perLevelGroups[1]) mbGroups = perLevelGroups[1];
        // store aggregates into variables for convenient access
        mbFractions = perLevelFractions[1];
        gbFractions = perLevelFractions[2];
        tbFractions = perLevelFractions[3];
        pbFractions = perLevelFractions[4];
        ebFractions = perLevelFractions[5];
        zbFractions = perLevelFractions[6];
        ybFractions = perLevelFractions[7];
        bbFractions = perLevelFractions[8];
        nbFractions = perLevelFractions[9];
        dbFractions = perLevelFractions[10];
        qbFractions = perLevelFractions[11];
        obFractions = perLevelFractions[12];
        gbGroups = perLevelGroups[2];
        tbGroups = perLevelGroups[3];
        pbGroups = perLevelGroups[4];
        ebGroups = perLevelGroups[5];
        zbGroups = perLevelGroups[6];
        ybGroups = perLevelGroups[7];
        bbGroups = perLevelGroups[8];
        nbGroups = perLevelGroups[9];
        dbGroups = perLevelGroups[10];
        qbGroups = perLevelGroups[11];
        obGroups = perLevelGroups[12];
      }
      var useMbLevel = levelIndex >= 1; // at least MB level
      // capture previous grouping state BEFORE we write diagnostics so we can
      // compare and decide whether to force a re-render. Previously we wrote
      // the dataset values first which made the 'previous' values identical
      // to the current, preventing rebuilds when group counts changed.
      const prevUseGrouping = bitField ? (bitField.dataset.useGrouping === '1') : false;
      const prevLevelIndex = bitField ? Number(bitField.dataset.levelIndex || '0') : 0;
      const prevBytesCount = bitField ? BigInt(bitField.dataset.bytesCount || '0') : 0n;
      // compute previous element count for the prev levelIndex (if any) so we
      // can detect changes in groupsAtLevel and force a rebuild when necessary.
      let prevGroupsAtLevel = 0;
      if (bitField && prevLevelIndex >= 0) {
        try {
          if (prevLevelIndex === 0) prevGroupsAtLevel = bitField.querySelectorAll('.kb-block').length;
          else if (prevLevelIndex === 1) prevGroupsAtLevel = bitField.querySelectorAll('.mb-block').length;
          else if (prevLevelIndex === 2) prevGroupsAtLevel = bitField.querySelectorAll('.gb-block').length;
          else if (prevLevelIndex === 3) prevGroupsAtLevel = bitField.querySelectorAll('.tb-block').length;
          else if (prevLevelIndex === 4) prevGroupsAtLevel = bitField.querySelectorAll('.pb-block').length;
          else if (prevLevelIndex === 5) prevGroupsAtLevel = bitField.querySelectorAll('.eb-block').length;
          else if (prevLevelIndex === 6) prevGroupsAtLevel = bitField.querySelectorAll('.zb-block').length;
          else if (prevLevelIndex === 7) prevGroupsAtLevel = bitField.querySelectorAll('.yb-block').length;
          else if (prevLevelIndex === 8) prevGroupsAtLevel = bitField.querySelectorAll('.bb-block').length;
          else if (prevLevelIndex === 9) prevGroupsAtLevel = bitField.querySelectorAll('.nb-block').length;
          else if (prevLevelIndex === 10) prevGroupsAtLevel = bitField.querySelectorAll('.db-block').length;
          else if (prevLevelIndex === 11) prevGroupsAtLevel = bitField.querySelectorAll('.qb-block').length;
          else if (prevLevelIndex === 12) prevGroupsAtLevel = bitField.querySelectorAll('.ob-block').length;
          else prevGroupsAtLevel = 0;
        } catch (e) { prevGroupsAtLevel = 0; }
      }
      try {
        if (prevUseGrouping !== useGrouping || prevLevelIndex !== levelIndex || prevGroupsAtLevel !== groupsAtLevel || prevBytesCount !== bytesCountForUnit) {
          const beforeCounts = { bytes: bitField.querySelectorAll('.byte').length, kb: bitField.querySelectorAll('.kb-block').length, mb: bitField.querySelectorAll('.mb-block').length };
          // Rebuild the DOM when structural group size or bytes count changes
          delete bitField.dataset.rendered;
          bitField.innerHTML = '';
        }
      } catch (e) { /* ignore usage errors computing previous counts */ }
      // expose grouping details to the DOM for diagnostics
      try {
        if (bitField) {
          bitField.dataset.levelIndex = String(levelIndex);
          bitField.dataset.groupCount = String(groupCount);
          bitField.dataset.useGrouping = useGrouping ? '1' : '0';
          bitField.dataset.bytesCount = String(bytesCountForUnit || 0n);
          bitField.dataset.mode = mode || '';
        }
      } catch (e) { }
      // do not re-declare mbGroups here — we already declared it above
      // computed per-level fractions: will use either kbFractions (from server/client) or compute from totalBitsBI
      let levelFractions = null; // fractions for the currently selected level (array of numbers 0..1)
      // If we have kbFractions precomputed, aggregate to the desired level
      if (kbFractions) {
        levelFractions = kbFractions.slice();
        for (let li = 1; li <= levelIndex; li++) {
          // aggregate by chunks of GROUPS_PER_LEVEL
          const agg = [];
          for (let i = 0; i < levelFractions.length; i += GROUPS_PER_LEVEL) {
            const slice = levelFractions.slice(i, i + GROUPS_PER_LEVEL);
            const sum = slice.reduce((a, b) => a + b, 0);
            agg.push(sum / slice.length);
          }
          levelFractions = agg;
        }
      }

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
        if (loader) { loader.classList.remove('hidden'); loader.setAttribute('aria-hidden', 'false'); loader.querySelector('.loader-label').textContent = 'Computing summary…'; }
        tryServerSummary(tb).then((srv) => {
          if (srv && srv.length) kbFractions = srv;
        }).catch(() => { }).finally(() => { if (loader) { loader.classList.add('hidden'); loader.setAttribute('aria-hidden', 'true'); } });
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
    else displayCount = groupsAtLevel;
    adjustSizing(displayCount, useGrouping, levelIndex);
    // if we already rendered something, capture the current bit string so we can
    // decide whether a full rebuild is needed (length differs) or we can update in-place
    const currentBitsFlat = bitField.dataset.rendered ? Array.from(bitField.querySelectorAll('.bit, .cell')).map(b => b.dataset.value || '0').join('') : null;
    // If grouping/level changed since last render, force a rebuild to replace DOM types
    try {
      // If either grouping mode/level changed or the number of groups at the
      // current level changed (for example 2 KB -> 3 KB) we must rebuild the DOM
      // instead of attempting an in-place update. See test case where changing
      // the input increases the KB group count, but prior logic didn't detect
      // the change and left stale canvas elements.
      if (prevUseGrouping !== useGrouping || prevLevelIndex !== levelIndex || prevGroupsAtLevel !== groupsAtLevel) {
        delete bitField.dataset.rendered;
        bitField.innerHTML = '';
      }
    } catch (e) { }
    // If we're grouping, we'll render groups (kbGroups) instead of individual bytes
    // if we're asked to render many items (bytes or groups), show a loader and render asynchronously
    // totalCells used to determine heavy / chunking: number of bits being represented
    let totalCells;
    if (!useGrouping) totalCells = bytes.length * 8;
    else totalCells = (kbFractions ? kbFractions.length : groupCount) * BITS_PER_GROUP;
    // diagnostic overlay to aid debugging in tests; shows key render parameters
    try {
      let dbg = document.getElementById('debug-info');
      if (!dbg) {
        dbg = document.createElement('div');
        dbg.id = 'debug-info';
        dbg.style.position = 'fixed';
        dbg.style.right = '8px';
        dbg.style.bottom = '8px';
        dbg.style.background = 'rgba(0,0,0,0.75)';
        dbg.style.color = '#0f0';
        dbg.style.padding = '6px 8px';
        dbg.style.borderRadius = '6px';
        dbg.style.fontSize = '12px';
        dbg.style.zIndex = 100000;
        document.body.appendChild(dbg);
      }
      dbg.textContent = `mode=${mode} bytes=${String(bytesCountForUnit)} useGrouping=${useGrouping} groupCount=${groupCount} levelIndex=${levelIndex} groupsAtLevel=${groupsAtLevel} totalCells=${totalCells}`;
    } catch (e) { }
    const heavyThreshold = 180; // number of byte groups considered heavy to render

    // Debug visibility for grouping decisions (useful in test logs)
    try { if (DEBUG_RENDER) console.debug('render', { mode, bytesCountForUnit: String(bytesCountForUnit), useGrouping, groupCount, levelIndex, groupsAtLevel, kbFractionsLen: (kbFractions && kbFractions.length) || 0 }); } catch (e) { }
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

        // generic helper to draw a high-level block as a 32x32 canvas
        const drawLevelBlock = (canvas, arr, levelIdx) => {
          const cols = 32;
          const rows = 32; // 32*32 = 1024 tiles per block
          const ctx = canvas.getContext('2d');
          canvas.width = cols;
          canvas.height = rows;
          // clear and paint background
          ctx.fillStyle = 'rgba(0,0,0,1)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const pixelBits = BigInt(BITS_PER_GROUP) * BigInt(GROUPS_PER_LEVEL ** Math.max(0, levelIdx - 1));
          const tiles = Math.min((arr ? arr.length : cols * rows), cols * rows);
          for (let i = 0; i < tiles; i++) {
            const v = arr ? arr[i] : null;
            let frac = 0;
            if (typeof v === 'string') {
              let ones = 0;
              for (let j = 0; j < v.length; j++) if (v[j] === '1') ones++;
              frac = ones / BITS_PER_GROUP;
            } else if (typeof v === 'number') {
              frac = v;
            } else {
              // compute fraction using totalBitsBI (contiguous model)
              const pixelIdx = BigInt(i);
              const startBits = pixelIdx * pixelBits;
              const endBits = startBits + pixelBits;
              const ones = (startBits >= totalBitsBI) ? 0n : ((endBits <= totalBitsBI) ? pixelBits : (totalBitsBI - startBits));
              frac = Number(ones) / Number(pixelBits);
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

        // wrappers for specific levels
        const drawMbBlock = (canvas, mbArray) => drawLevelBlock(canvas, mbArray, 1);
        const drawGbBlock = (canvas, gbArray) => drawLevelBlock(canvas, gbArray, 2);
        const drawTbBlock = (canvas, tbArray) => drawLevelBlock(canvas, tbArray, 3);
        const drawPbBlock = (canvas, pbArray) => drawLevelBlock(canvas, pbArray, 4);
        const drawEbBlock = (canvas, ebArray) => drawLevelBlock(canvas, ebArray, 5);
        const drawZbBlock = (canvas, zbArray) => drawLevelBlock(canvas, zbArray, 6);
        const drawYbBlock = (canvas, ybArray) => drawLevelBlock(canvas, ybArray, 7);
        const drawBbBlock = (canvas, bbArray) => drawLevelBlock(canvas, bbArray, 8);
        const drawNbBlock = (canvas, nbArray) => drawLevelBlock(canvas, nbArray, 9);
        const drawDbBlock = (canvas, dbArray) => drawLevelBlock(canvas, dbArray, 10);
        const drawQbBlock = (canvas, qbArray) => drawLevelBlock(canvas, qbArray, 11);
        const drawObBlock = (canvas, obArray) => drawLevelBlock(canvas, obArray, 12);

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

        // helper to append a GB/TB/PB/... group DOM
        const appendGb = (gbArray, idx) => {
          const gbEl = document.createElement('div');
          gbEl.className = 'gb-block';
          gbEl.dataset.gbIndex = idx;
          const canvas = document.createElement('canvas');
          canvas.className = 'gb-canvas';
          canvas.dataset.gbIndex = idx;
          drawGbBlock(canvas, gbArray);
          const title = document.createElement('div');
          title.className = 'gb-title';
          title.textContent = `GB ${idx}`;
          gbEl.appendChild(canvas);
          gbEl.appendChild(title);
          bitField.appendChild(gbEl);
          canvas.style.opacity = '0';
          setTimeout(() => { canvas.style.transition = 'opacity 280ms ease'; canvas.style.opacity = '1'; }, 12);
        };
        const appendTb = (tbArray, idx) => {
          const tbEl = document.createElement('div');
          tbEl.className = 'tb-block';
          tbEl.dataset.tbIndex = idx;
          const canvas = document.createElement('canvas');
          canvas.className = 'tb-canvas';
          canvas.dataset.tbIndex = idx;
          drawTbBlock(canvas, tbArray);
          const title = document.createElement('div');
          title.className = 'tb-title';
          title.textContent = `TB ${idx}`;
          tbEl.appendChild(canvas);
          tbEl.appendChild(title);
          bitField.appendChild(tbEl);
          canvas.style.opacity = '0';
          setTimeout(() => { canvas.style.transition = 'opacity 280ms ease'; canvas.style.opacity = '1'; }, 12);
        };
        const appendPb = (pbArray, idx) => {
          const pbEl = document.createElement('div');
          pbEl.className = 'pb-block';
          pbEl.dataset.pbIndex = idx;
          const canvas = document.createElement('canvas');
          canvas.className = 'pb-canvas';
          canvas.dataset.pbIndex = idx;
          drawPbBlock(canvas, pbArray);
          const title = document.createElement('div');
          title.className = 'pb-title';
          title.textContent = `PB ${idx}`;
          pbEl.appendChild(canvas);
          pbEl.appendChild(title);
          bitField.appendChild(pbEl);
          canvas.style.opacity = '0';
          setTimeout(() => { canvas.style.transition = 'opacity 280ms ease'; canvas.style.opacity = '1'; }, 12);
        };
        const appendEb = (ebArray, idx) => {
          const ebEl = document.createElement('div');
          ebEl.className = 'eb-block';
          ebEl.dataset.ebIndex = idx;
          const canvas = document.createElement('canvas');
          canvas.className = 'eb-canvas';
          canvas.dataset.ebIndex = idx;
          drawEbBlock(canvas, ebArray);
          const title = document.createElement('div');
          title.className = 'eb-title';
          title.textContent = `EB ${idx}`;
          ebEl.appendChild(canvas);
          ebEl.appendChild(title);
          bitField.appendChild(ebEl);
          canvas.style.opacity = '0';
          setTimeout(() => { canvas.style.transition = 'opacity 280ms ease'; canvas.style.opacity = '1'; }, 12);
        };
        const appendZb = (zbArray, idx) => {
          const zbEl = document.createElement('div');
          zbEl.className = 'zb-block';
          zbEl.dataset.zbIndex = idx;
          const canvas = document.createElement('canvas');
          canvas.className = 'zb-canvas';
          canvas.dataset.zbIndex = idx;
          drawZbBlock(canvas, zbArray);
          const title = document.createElement('div');
          title.className = 'zb-title';
          title.textContent = `ZB ${idx}`;
          zbEl.appendChild(canvas);
          zbEl.appendChild(title);
          bitField.appendChild(zbEl);
          canvas.style.opacity = '0';
          setTimeout(() => { canvas.style.transition = 'opacity 280ms ease'; canvas.style.opacity = '1'; }, 12);
        };
        const appendYb = (ybArray, idx) => {
          const ybEl = document.createElement('div');
          ybEl.className = 'yb-block';
          ybEl.dataset.ybIndex = idx;
          const canvas = document.createElement('canvas');
          canvas.className = 'yb-canvas';
          canvas.dataset.ybIndex = idx;
          drawYbBlock(canvas, ybArray);
          const title = document.createElement('div');
          title.className = 'yb-title';
          title.textContent = `YB ${idx}`;
          ybEl.appendChild(canvas);
          ybEl.appendChild(title);
          bitField.appendChild(ybEl);
          canvas.style.opacity = '0';
          setTimeout(() => { canvas.style.transition = 'opacity 280ms ease'; canvas.style.opacity = '1'; }, 12);
        };
        const appendBb = (bbArray, idx) => {
          const bbEl = document.createElement('div');
          bbEl.className = 'bb-block';
          bbEl.dataset.bbIndex = idx;
          const canvas = document.createElement('canvas');
          canvas.className = 'bb-canvas';
          canvas.dataset.bbIndex = idx;
          drawBbBlock(canvas, bbArray);
          const title = document.createElement('div');
          title.className = 'bb-title';
          title.textContent = `BB ${idx}`;
          bbEl.appendChild(canvas);
          bbEl.appendChild(title);
          bitField.appendChild(bbEl);
          canvas.style.opacity = '0';
          setTimeout(() => { canvas.style.transition = 'opacity 280ms ease'; canvas.style.opacity = '1'; }, 12);
        };
        const appendNb = (nbArray, idx) => {
          const nbEl = document.createElement('div');
          nbEl.className = 'nb-block';
          nbEl.dataset.nbIndex = idx;
          const canvas = document.createElement('canvas');
          canvas.className = 'nb-canvas';
          canvas.dataset.nbIndex = idx;
          drawNbBlock(canvas, nbArray);
          const title = document.createElement('div');
          title.className = 'nb-title';
          title.textContent = `NB ${idx}`;
          nbEl.appendChild(canvas);
          nbEl.appendChild(title);
          bitField.appendChild(nbEl);
          canvas.style.opacity = '0';
          setTimeout(() => { canvas.style.transition = 'opacity 280ms ease'; canvas.style.opacity = '1'; }, 12);
        };
        const appendDb = (dbArray, idx) => {
          const dbEl = document.createElement('div');
          dbEl.className = 'db-block';
          dbEl.dataset.dbIndex = idx;
          const canvas = document.createElement('canvas');
          canvas.className = 'db-canvas';
          canvas.dataset.dbIndex = idx;
          drawDbBlock(canvas, dbArray);
          const title = document.createElement('div');
          title.className = 'db-title';
          title.textContent = `DB ${idx}`;
          dbEl.appendChild(canvas);
          dbEl.appendChild(title);
          bitField.appendChild(dbEl);
          canvas.style.opacity = '0';
          setTimeout(() => { canvas.style.transition = 'opacity 280ms ease'; canvas.style.opacity = '1'; }, 12);
        };
        const appendQb = (qbArray, idx) => {
          const qbEl = document.createElement('div');
          qbEl.className = 'qb-block';
          qbEl.dataset.qbIndex = idx;
          const canvas = document.createElement('canvas');
          canvas.className = 'qb-canvas';
          canvas.dataset.qbIndex = idx;
          drawQbBlock(canvas, qbArray);
          const title = document.createElement('div');
          title.className = 'qb-title';
          title.textContent = `QB ${idx}`;
          qbEl.appendChild(canvas);
          qbEl.appendChild(title);
          bitField.appendChild(qbEl);
          canvas.style.opacity = '0';
          setTimeout(() => { canvas.style.transition = 'opacity 280ms ease'; canvas.style.opacity = '1'; }, 12);
        };
        const appendOb = (obArray, idx) => {
          const obEl = document.createElement('div');
          obEl.className = 'ob-block';
          obEl.dataset.obIndex = idx;
          const canvas = document.createElement('canvas');
          canvas.className = 'ob-canvas';
          canvas.dataset.obIndex = idx;
          drawObBlock(canvas, obArray);
          const title = document.createElement('div');
          title.className = 'ob-title';
          title.textContent = `OB ${idx}`;
          obEl.appendChild(canvas);
          obEl.appendChild(title);
          bitField.appendChild(obEl);
          canvas.style.opacity = '0';
          setTimeout(() => { canvas.style.transition = 'opacity 280ms ease'; canvas.style.opacity = '1'; }, 12);
        };

        // Try server summary fetch separately — this helper only makes the network call

        if (useGrouping) {
          // grouped rendering path
          // For any levelIndex (1=MB,2=GB,3=TB...), compute per-level fractions if needed and append accordingly.
          if (totalCells < CHUNK_CELL_THRESHOLD) {
            if (bitField) bitField.dataset.branch = 'grouping-sync';
            // small: append all items for the selected level synchronously
            for (let i = 0; i < groupsAtLevel; i++) {
              // pick append function based on levelIndex
              if (levelIndex === 0) {
                // KB-level: each group is a KB canvas tile
                if (kbFractions && kbFractions[i]) appendKb(kbFractions[i], i);
                else {
                  const s = BigInt(i) * BigInt(BITS_PER_GROUP);
                  const e = s + BigInt(BITS_PER_GROUP);
                  const ones = s >= totalBitsBI ? 0n : (e <= totalBitsBI ? BigInt(BITS_PER_GROUP) : (totalBitsBI - s));
                  appendKb(Number(ones) / BITS_PER_GROUP, i);
                }
              } else if (levelIndex === 1) {
                // MB-level
                if (mbGroups && mbGroups[i]) appendMb(mbGroups[i], i);
                else if (kbFractions && kbFractions[i]) appendMb(kbFractions.slice(i * GROUPS_PER_LEVEL, i * GROUPS_PER_LEVEL + GROUPS_PER_LEVEL), i);
                else {
                  // compute fractions for this MB as a single fraction instead of full KB array
                  const startBits = BigInt(i) * BigInt(BITS_PER_GROUP) * BigInt(GROUPS_PER_LEVEL);
                  const endBits = startBits + BigInt(BITS_PER_GROUP) * BigInt(GROUPS_PER_LEVEL);
                  const ones = startBits >= totalBitsBI ? 0n : (endBits <= totalBitsBI ? BigInt(BITS_PER_GROUP) * BigInt(GROUPS_PER_LEVEL) : (totalBitsBI - startBits));
                  const frac = Number(ones) / Number(BigInt(BITS_PER_GROUP) * BigInt(GROUPS_PER_LEVEL));
                  // for MB canvas we can use per-KB fraction (MB canvas expects KB-level pixels); create array with single frac if necessary
                  appendMb(new Array(GROUPS_PER_LEVEL).fill(frac), i);
                }
              } else if (levelIndex === 2) {
                if (gbGroups && gbGroups[i]) appendGb(gbGroups[i], i);
                else if (gbFractions && gbFractions[i] !== undefined) {
                  // create MB-level array for this GB
                  const base = i * GROUPS_PER_LEVEL;
                  const slice = gbFractions.slice(base, base + GROUPS_PER_LEVEL);
                  appendGb(slice, i);
                } else {
                  const bitsPerMb = BigInt(BITS_PER_GROUP) * BigInt(GROUPS_PER_LEVEL);
                  const startBits = BigInt(i) * bitsPerMb;
                  const endBits = startBits + bitsPerMb;
                  const ones = startBits >= totalBitsBI ? 0n : (endBits <= totalBitsBI ? bitsPerMb : (totalBitsBI - startBits));
                  const frac = Number(ones) / Number(bitsPerMb);
                  appendGb(new Array(GROUPS_PER_LEVEL).fill(frac), i);
                }
              } else if (levelIndex === 3) {
                if (tbGroups && tbGroups[i]) appendTb(tbGroups[i], i);
                else if (tbFractions && tbFractions[i] !== undefined) {
                  const base = i * GROUPS_PER_LEVEL;
                  const slice = tbFractions.slice(base, base + GROUPS_PER_LEVEL);
                  appendTb(slice, i);
                } else {
                  const bitsPerGb = BigInt(BITS_PER_GROUP) * BigInt(GROUPS_PER_LEVEL) * BigInt(GROUPS_PER_LEVEL);
                  const startBits = BigInt(i) * bitsPerGb;
                  const endBits = startBits + bitsPerGb;
                  const ones = startBits >= totalBitsBI ? 0n : (endBits <= totalBitsBI ? bitsPerGb : (totalBitsBI - startBits));
                  const frac = Number(ones) / Number(bitsPerGb);
                  appendTb(new Array(GROUPS_PER_LEVEL).fill(frac), i);
                }
              } else if (levelIndex === 4) {
                if (pbGroups && pbGroups[i]) appendPb(pbGroups[i], i);
                else if (pbFractions && pbFractions[i] !== undefined) {
                  const base = i * GROUPS_PER_LEVEL;
                  const slice = pbFractions.slice(base, base + GROUPS_PER_LEVEL);
                  appendPb(slice, i);
                } else {
                  const bitsPerTb = BigInt(BITS_PER_GROUP) * BigInt(GROUPS_PER_LEVEL) ** 3n;
                  const startBits = BigInt(i) * bitsPerTb;
                  const endBits = startBits + bitsPerTb;
                  const ones = startBits >= totalBitsBI ? 0n : (endBits <= totalBitsBI ? bitsPerTb : (totalBitsBI - startBits));
                  const frac = Number(ones) / Number(bitsPerTb);
                  appendPb(new Array(GROUPS_PER_LEVEL).fill(frac), i);
                }
              } else if (levelIndex === 5) {
                if (ebGroups && ebGroups[i]) appendEb(ebGroups[i], i);
                else if (ebFractions && ebFractions[i] !== undefined) {
                  const base = i * GROUPS_PER_LEVEL;
                  const slice = ebFractions.slice(base, base + GROUPS_PER_LEVEL);
                  appendEb(slice, i);
                } else {
                  const bitsPerPb = BigInt(BITS_PER_GROUP) * BigInt(GROUPS_PER_LEVEL) ** 4n;
                  const startBits = BigInt(i) * bitsPerPb;
                  const endBits = startBits + bitsPerPb;
                  const ones = startBits >= totalBitsBI ? 0n : (endBits <= totalBitsBI ? bitsPerPb : (totalBitsBI - startBits));
                  const frac = Number(ones) / Number(bitsPerPb);
                  appendEb(new Array(GROUPS_PER_LEVEL).fill(frac), i);
                }
              } else if (levelIndex === 6) {
                if (zbFractions && zbFractions[i] !== undefined) appendZb(zbFractions[i], i);
                else {
                  const bitsPerEb = BigInt(BITS_PER_GROUP) * BigInt(GROUPS_PER_LEVEL) ** 5n;
                  const startBits = BigInt(i) * bitsPerEb;
                  const endBits = startBits + bitsPerEb;
                  const ones = startBits >= totalBitsBI ? 0n : (endBits <= totalBitsBI ? bitsPerEb : (totalBitsBI - startBits));
                  const frac = Number(ones) / Number(bitsPerEb);
                  appendZb(new Array(GROUPS_PER_LEVEL).fill(frac), i);
                }
              } else if (levelIndex === 7) {
                if (ybFractions && ybFractions[i] !== undefined) appendYb(ybFractions[i], i);
                else {
                  const bitsPerZb = BigInt(BITS_PER_GROUP) * BigInt(GROUPS_PER_LEVEL) ** 6n;
                  const startBits = BigInt(i) * bitsPerZb;
                  const endBits = startBits + bitsPerZb;
                  const ones = startBits >= totalBitsBI ? 0n : (endBits <= totalBitsBI ? bitsPerZb : (totalBitsBI - startBits));
                  const frac = Number(ones) / Number(bitsPerZb);
                  appendYb(new Array(GROUPS_PER_LEVEL).fill(frac), i);
                }
              } else if (levelIndex === 8) {
                if (bbFractions && bbFractions[i] !== undefined) appendBb(bbFractions[i], i);
                else {
                  const bitsPerYb = BigInt(BITS_PER_GROUP) * BigInt(GROUPS_PER_LEVEL) ** 7n;
                  const startBits = BigInt(i) * bitsPerYb;
                  const endBits = startBits + bitsPerYb;
                  const ones = startBits >= totalBitsBI ? 0n : (endBits <= totalBitsBI ? bitsPerYb : (totalBitsBI - startBits));
                  const frac = Number(ones) / Number(bitsPerYb);
                  appendBb(new Array(GROUPS_PER_LEVEL).fill(frac), i);
                }
              } else if (levelIndex === 9) {
                if (nbFractions && nbFractions[i] !== undefined) appendNb(nbFractions[i], i);
                else {
                  const bitsPerBb = BigInt(BITS_PER_GROUP) * BigInt(GROUPS_PER_LEVEL) ** 8n;
                  const startBits = BigInt(i) * bitsPerBb;
                  const endBits = startBits + bitsPerBb;
                  const ones = startBits >= totalBitsBI ? 0n : (endBits <= totalBitsBI ? bitsPerBb : (totalBitsBI - startBits));
                  const frac = Number(ones) / Number(bitsPerBb);
                  appendNb(new Array(GROUPS_PER_LEVEL).fill(frac), i);
                }
              } else if (levelIndex === 10) {
                if (dbFractions && dbFractions[i] !== undefined) appendDb(dbFractions[i], i);
                else {
                  const bitsPerNb = BigInt(BITS_PER_GROUP) * BigInt(GROUPS_PER_LEVEL) ** 9n;
                  const startBits = BigInt(i) * bitsPerNb;
                  const endBits = startBits + bitsPerNb;
                  const ones = startBits >= totalBitsBI ? 0n : (endBits <= totalBitsBI ? bitsPerNb : (totalBitsBI - startBits));
                  const frac = Number(ones) / Number(bitsPerNb);
                  appendDb(new Array(GROUPS_PER_LEVEL).fill(frac), i);
                }
              } else if (levelIndex === 11) {
                if (qbFractions && qbFractions[i] !== undefined) appendQb(qbFractions[i], i);
                else {
                  const bitsPerDb = BigInt(BITS_PER_GROUP) * BigInt(GROUPS_PER_LEVEL) ** 10n;
                  const startBits = BigInt(i) * bitsPerDb;
                  const endBits = startBits + bitsPerDb;
                  const ones = startBits >= totalBitsBI ? 0n : (endBits <= totalBitsBI ? bitsPerDb : (totalBitsBI - startBits));
                  const frac = Number(ones) / Number(bitsPerDb);
                  appendQb(new Array(GROUPS_PER_LEVEL).fill(frac), i);
                }
              } else if (levelIndex === 12) {
                if (obFractions && obFractions[i] !== undefined) appendOb(obFractions[i], i);
                else {
                  const bitsPerQb = BigInt(BITS_PER_GROUP) * BigInt(GROUPS_PER_LEVEL) ** 11n;
                  const startBits = BigInt(i) * bitsPerQb;
                  const endBits = startBits + bitsPerQb;
                  const ones = startBits >= totalBitsBI ? 0n : (endBits <= totalBitsBI ? bitsPerQb : (totalBitsBI - startBits));
                  const frac = Number(ones) / Number(bitsPerQb);
                  appendOb(new Array(GROUPS_PER_LEVEL).fill(frac), i);
                }
              } else {
                // unknown levelIndex, keep using level 12
                if (obFractions && obFractions[i] !== undefined) appendOb(obFractions[i], i);
                else {
                  const bitsPerOb = BigInt(BITS_PER_GROUP) * BigInt(GROUPS_PER_LEVEL) ** 12n;
                  const startBits = BigInt(i) * bitsPerOb;
                  const endBits = startBits + bitsPerOb;
                  const ones = startBits >= totalBitsBI ? 0n : (endBits <= totalBitsBI ? bitsPerOb : (totalBitsBI - startBits));
                  const frac = Number(ones) / Number(bitsPerOb);
                  appendOb(new Array(GROUPS_PER_LEVEL).fill(frac), i);
                }
              }
            }
          } else {
            if (bitField) bitField.dataset.branch = 'grouping-heavy';
            // heavy path: do not synchronously append all groups; try to use server-side summary if we don't have kbFractions
            if (kbFractions) {
              // show loader while we prepare MB groups for chunked rendering
              if (loader) { loader.classList.remove('hidden'); loader.setAttribute('aria-hidden', 'false'); loader.querySelector('.loader-label').textContent = 'Preparing…'; }
              // build MB groups (each MB contains up to GROUPS_PER_LEVEL KB groups) so the chunked renderer can pick them up
              mbGroups = [];
              for (let i = 0; i < kbFractions.length; i += GROUPS_PER_LEVEL) mbGroups.push(kbFractions.slice(i, i + GROUPS_PER_LEVEL));
            } else {
              // indicate that a server-side summary is in-flight (optional performance optimization)
              if (loader) { loader.classList.remove('hidden'); loader.setAttribute('aria-hidden', 'false'); loader.querySelector('.loader-label').textContent = 'Computing summary…'; }
              const totalBits = Number(totalBitsBI > 9_000_000_000n ? 9_000_000_000n : totalBitsBI);
              tryServerSummary(totalBits).then((srvKb) => {
                if (srvKb && srvKb.length) {
                  kbFractions = srvKb;
                  // compute MB groups for chunked renderer
                  mbGroups = [];
                  for (let i = 0; i < kbFractions.length; i += GROUPS_PER_LEVEL) mbGroups.push(kbFractions.slice(i, i + GROUPS_PER_LEVEL));
                }
              }).catch(() => { }).finally(() => {
                if (loader) { loader.classList.add('hidden'); loader.setAttribute('aria-hidden', 'true'); }
              });
            }
          }
        }
        else if (totalCells < CHUNK_CELL_THRESHOLD) {
          if (bitField) bitField.dataset.branch = 'nongroup-sync';
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
        } else {
          totalItems = groupsAtLevel;
        }
        if (useGrouping) {
          effectiveChunkSize = levelIndex >= 2 ? 2 : 8; // fewer items for larger levels
        } else {
          effectiveChunkSize = chunkSize;
        }
        if (totalCells >= CHUNK_CELL_THRESHOLD) {
          if (bitField) bitField.dataset.branch = 'chunked';
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
                if (levelIndex === 0) {
                  // KB-level
                  if (kbFractions) appendKb(kbFractions[idx], idx, true);
                  else {
                    const s = BigInt(idx) * BigInt(BITS_PER_GROUP);
                    const e = s + BigInt(BITS_PER_GROUP);
                    const ones = s >= totalBitsBI ? 0n : (e <= totalBitsBI ? BigInt(BITS_PER_GROUP) : (totalBitsBI - s));
                    appendKb(Number(ones) / BITS_PER_GROUP, idx, true);
                  }
                } else {
                  // Higher levels (MB/GB/TB...): append block containing GROUPS_PER_LEVEL subunits
                  const baseIdx = idx * GROUPS_PER_LEVEL;
                  const arr = [];
                  const elementUnitLevel = levelIndex - 1; // 0=KB,1=MB,... elements represent this level
                  // compute bits per element unit
                  const bitsPerElement = BigInt(BITS_PER_GROUP) * BigInt(GROUPS_PER_LEVEL) ** BigInt(elementUnitLevel);
                  // pick the correct source fractions array for the element level
                  let sourceFractions = null;
                  if (elementUnitLevel === 0) sourceFractions = kbFractions;
                  else if (elementUnitLevel === 1) sourceFractions = mbFractions;
                  else if (elementUnitLevel === 2) sourceFractions = gbFractions;
                  else if (elementUnitLevel === 3) sourceFractions = tbFractions;
                  else if (elementUnitLevel === 4) sourceFractions = pbFractions;
                  else if (elementUnitLevel === 5) sourceFractions = ebFractions;
                  else sourceFractions = zbFractions;
                  for (let j = baseIdx; j < Math.min(groupCount, baseIdx + GROUPS_PER_LEVEL); j++) {
                    if (sourceFractions && sourceFractions[j] !== undefined) arr.push(sourceFractions[j]);
                    else {
                      const s = BigInt(j) * bitsPerElement;
                      const e = s + bitsPerElement;
                      const ones = s >= totalBitsBI ? 0n : (e <= totalBitsBI ? bitsPerElement : (totalBitsBI - s));
                      arr.push(Number(ones) / Number(bitsPerElement));
                    }
                  }
                  // choose append function for the selected level
                  if (levelIndex === 1) appendMb(arr, idx);
                  else if (levelIndex === 2) appendGb(arr, idx);
                  else if (levelIndex === 3) appendTb(arr, idx);
                  else if (levelIndex === 4) appendPb(arr, idx);
                  else if (levelIndex === 5) appendEb(arr, idx);
                  else if (levelIndex === 6) appendZb(arr, idx);
                  else if (levelIndex === 7) appendYb(arr, idx);
                  else if (levelIndex === 8) appendBb(arr, idx);
                  else if (levelIndex === 9) appendNb(arr, idx);
                  else if (levelIndex === 10) appendDb(arr, idx);
                  else if (levelIndex === 11) appendQb(arr, idx);
                  else if (levelIndex === 12) appendOb(arr, idx);
                  else {
                    // unknown levelIndex, keep using level 12
                    appendOb(arr, idx);
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
              // pick canvas class by levelIndex
              const canvasClass = levelIndex === 0 ? '.kb-canvas' : levelIndex === 1 ? '.mb-canvas' : levelIndex === 2 ? '.gb-canvas' : levelIndex === 3 ? '.tb-canvas' : levelIndex === 4 ? '.pb-canvas' : levelIndex === 5 ? '.eb-canvas' : levelIndex === 6 ? '.zb-canvas' : levelIndex === 7 ? '.yb-canvas' : levelIndex === 8 ? '.bb-canvas' : levelIndex === 9 ? '.nb-canvas' : levelIndex === 10 ? '.db-canvas' : levelIndex === 11 ? '.qb-canvas' : '.ob-canvas';
              const canvases = Array.from(bitField.querySelectorAll(canvasClass)).slice(start, end);
              if (canvases.length) canvases.forEach(c => {
                if (levelIndex === 0) return; // KB-level uses internal per-row reveal
                c.style.opacity = '0'; setTimeout(() => c.style.opacity = '1', 6);
              });
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
              // Debug final DOM counts
              try {
                const counts = { bytes: bitField.querySelectorAll('.byte').length, kb: bitField.querySelectorAll('.kb-block').length, mb: bitField.querySelectorAll('.mb-block').length };
                if (DEBUG_RENDER) console.debug('render-finished', counts);
              } catch (e) { }
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
        try {
          const counts = { bytes: bitField.querySelectorAll('.byte').length, kb: bitField.querySelectorAll('.kb-block').length, mb: bitField.querySelectorAll('.mb-block').length };
          if (DEBUG_RENDER) console.debug('render-finished-nonchunk', counts);
        } catch (e) { }
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
      // Allow a small paint window so loader becomes visible before heavy work starts.
      setTimeout(renderDom, 24);
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
      let nextStr = next.toString();
      try {
        const max = Number(numberInput.maxLength || 0);
        if (max > 0 && nextStr.length > max) nextStr = nextStr.slice(0, max);
      } catch (e) { /* ignore */ }
      numberInput.value = nextStr;
      const converted = (mode === 'bitcount') ? (parseNumber(numberInput.value) * (UNIT_TO_BITS[unit] || 1n)) : parseNumber(numberInput.value);
      render(converted);
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

  function adjustSizing(byteCount, isGrouped = false, levelIndex = 0) {
    // decide how cramped it is. Measure container width and estimated byte width.
    const wrap = document.getElementById('bitField-wrap');
    const containerW = wrap.clientWidth || wrap.getBoundingClientRect().width;
    const computed = getComputedStyle(document.documentElement);
    const circle = parseFloat(computed.getPropertyValue('--circle-size')) || 36;
    const gap = parseFloat(computed.getPropertyValue('--gap')) || 10;
    // rough estimate: each byte has 8 bits + padding, but bits arranged in single row; each bit width + gaps
    let byteWidth;
    if (isGrouped) {
      // For grouped display, adjust based on levelIndex
      // levelIndex 0 => KB-level (smaller tiles), 1 => MB-level (bigger), 2+ => GB/TB... (even bigger)
      if (levelIndex === 0) {
        byteWidth = 180 + 24; // KB tile size + padding (matches .kb-canvas width)
      } else {
        byteWidth = 260 + 24; // MB or higher
      }
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
      // enforce max length in case of programmatic or pasted values
      try {
        const max = Number(numberInput.maxLength || 0);
        if (max > 0 && numberInput.value && numberInput.value.length > max) {
          numberInput.value = numberInput.value.slice(0, max);
        }
      } catch (e) { /* ignore */ }
      const n = parseNumber(numberInput.value);
      // Convert the parsed number to bits depending on the unit selection when in bitcount mode
      const converted = (mode === 'bitcount') ? (n * (UNIT_TO_BITS[unit] || 1n)) : n;
      render(converted);
    }, 140);
  });

  // keyboard stepper: arrow keys increment/decrement the numeric input
  // - ArrowUp / ArrowDown change value by 1
  // - Shift + Arrow -> change by 10
  // - Ctrl  + Arrow -> change by 100
  // - Alt   + Arrow -> change by 1000
  // - Ctrl + Shift + Arrow -> change by 10000
  // - Shift + Alt + Arrow -> change by 100000
  // - Ctrl + Alt + Arrow -> change by 1000000
  // - Ctrl + Shift + Alt + Arrow -> change by 10000000
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
    let nextStr = next.toString();
    // respect max length if set
    try {
      const max = Number(numberInput.maxLength || 0);
      if (max > 0 && nextStr.length > max) nextStr = nextStr.slice(0, max);
    } catch (e) { /* ignore */ }
    numberInput.value = nextStr;
    const converted = (mode === 'bitcount') ? (parseNumber(numberInput.value) * (UNIT_TO_BITS[unit] || 1n)) : parseNumber(numberInput.value);
    render(converted);
  });

  // when user switches modes update the label and re-render
  if (modeSelect) {
    modeSelect.addEventListener('change', (e) => {
      mode = e.target.value;
      // update maxlength for input when mode changes
      try { applyModeMaxLength(); } catch (err) { /* ignore */ }
      if (inputLabel) {
        if (mode === 'bitcount') {
          if (unit === 'bits') inputLabel.textContent = 'Enter bit count:';
          else if (unit === 'bytes') inputLabel.textContent = 'Enter byte count';
          else inputLabel.textContent = `Enter ${unit} count`;
        } else {
          inputLabel.textContent = 'Enter integer';
        }
      }
      if (unitSelect && unitSelect.parentElement) {
        const hide = (mode !== 'bitcount');
        unitSelect.parentElement.hidden = hide;
        unitSelect.parentElement.style.display = hide ? 'none' : '';
      }
      // Do not reset the value on mode change (tests/automation will set as needed).
      // Preserve the user's current input and re-render according to the selected mode.
      numberInput.focus();
      // re-render with the current input interpretation
      // Ensure we re-render using the current input value -> dispatch input to trigger normal flow
      numberInput.dispatchEvent(new Event('input'));
    });
  }

  if (unitSelect) {
    unitSelect.addEventListener('change', (e) => {
      unit = e.target.value;
      if (inputLabel && mode === 'bitcount') {
        if (unit === 'bits') inputLabel.textContent = 'Enter bit count:';
        else if (unit === 'bytes') inputLabel.textContent = 'Enter byte count';
        else inputLabel.textContent = `Enter ${unit} count`;
      }
      // Re-render using converted value for new unit
      const n = parseNumber(numberInput.value);
      const converted = (mode === 'bitcount') ? (n * (UNIT_TO_BITS[unit] || 1n)) : n;
      render(converted);
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
