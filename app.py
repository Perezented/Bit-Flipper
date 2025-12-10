from flask import Flask, send_from_directory, render_template, request, jsonify
import os

app = Flask(__name__, static_folder='static', template_folder='static')


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)


@app.route('/api/group_summary', methods=['POST'])
def group_summary():
    # Accept JSON: { value: number-as-string, mode: 'bitcount'|'binary' }
    try:
        data = request.get_json(force=True)
    except Exception:
        return jsonify(error='invalid_json'), 400

    mode = data.get('mode', 'bitcount')
    value = data.get('value', '0')
    try:
        value_int = int(value)
    except Exception:
        return jsonify(error='invalid_value'), 400

    # Only support bitcount mode for grouping summary currently
    if mode != 'bitcount':
        return jsonify(error='mode_not_supported'), 400

    # constants should match the client (1024 bytes => 8192 bits per KB)
    GROUP_BYTES = 1024
    BITS_PER_GROUP = GROUP_BYTES * 8
    total_bits = int(value_int)
    if total_bits < 0:
        return jsonify(error='invalid_value'), 400

    group_count = max(1, (total_bits + BITS_PER_GROUP - 1) // BITS_PER_GROUP)
    groups = []
    for gi in range(group_count):
        start = gi * BITS_PER_GROUP
        end = min(total_bits, start + BITS_PER_GROUP)
        ones = max(0, end - start)
        frac = ones / BITS_PER_GROUP
        groups.append(round(frac, 6))

    return jsonify({ 'group_count': group_count, 'kb_fractions': groups })
