import re, json, sys, os, glob

ESC = {'n': '\n', 't': '\t', 'r': '\r', '"': '"', '\\': '\\', '0': '\0'}


def parse_cs_string(s, i):
    verbatim = s[i] == '@'
    if verbatim:
        i += 1
    assert s[i] == '"', s[i:i + 20]
    i += 1
    out = []
    while True:
        c = s[i]
        if verbatim:
            if c == '"':
                if s[i + 1] == '"':
                    out.append('"')
                    i += 2
                    continue
                return ''.join(out), i + 1
            out.append(c)
            i += 1
            continue
        if c == '\\':
            n = s[i + 1]
            if n in ESC:
                out.append(ESC[n])
                i += 2
                continue
            if n == 'u':
                out.append(chr(int(s[i + 2:i + 6], 16)))
                i += 6
                continue
            raise Exception('escape ' + n)
        if c == '"':
            return ''.join(out), i + 1
        out.append(c)
        i += 1


def is_string_start(s, i):
    return s[i] == '"' or (s[i] == '@' and i + 1 < len(s) and s[i + 1] == '"')


def parse_args(s):
    vals = []
    i = 0
    while i < len(s):
        c = s[i]
        if c in ' ,\t\n\r':
            i += 1
            continue
        if is_string_start(s, i):
            v, i = parse_cs_string(s, i)
            vals.append(v)
            continue
        m = re.match(r'(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)[dDfFmMuU]?', s[i:])
        if m and m.group(0):
            t = m.group(1)
            vals.append(float(t) if any(ch in t for ch in '.eE') else int(t))
            i += len(m.group(0))
            continue
        m = re.match(r'(true|false|null)\b', s[i:])
        if m:
            vals.append({'true': True, 'false': False, 'null': None}[m.group(1)])
            i += len(m.group(0))
            continue
        m = re.match(r'new\s*(?:string|int|double|object|uint)?\s*\[\]\s*\{', s[i:])
        if m:
            j = i + len(m.group(0))
            depth = 1
            k = j
            while depth:
                if is_string_start(s, k):
                    _, k = parse_cs_string(s, k)
                    continue
                if s[k] == '{':
                    depth += 1
                elif s[k] == '}':
                    depth -= 1
                k += 1
            vals.append(parse_args(s[j:k - 1]))
            i = k
            continue
        m = re.match(r'[A-Za-z_][\w.]*', s[i:])
        if m:
            vals.append({'expr': m.group(0)})
            i += len(m.group(0))
            continue
        raise Exception('cannot parse at: ' + s[i:i + 40])
    return vals


def balanced(text, start, open_c, close_c):
    depth = 0
    i = start
    while True:
        if is_string_start(text, i):
            _, i = parse_cs_string(text, i)
            continue
        c = text[i]
        if c == open_c:
            depth += 1
        elif c == close_c:
            depth -= 1
            if depth == 0:
                return i
        i += 1


def extract(path):
    text = open(path, encoding='utf-8-sig').read()
    methods = []
    pending = []
    kind = None
    i = 0
    pat = re.compile(r'\[(Theory|Fact)\]|\[InlineData|(?:public|private)\s+(?:static\s+)?(?:void|\w+)\s+(\w+)\s*\(')
    while True:
        m = pat.search(text, i)
        if not m:
            break
        if m.group(1):
            kind = m.group(1)
            pending = []
            i = m.end()
            continue
        if m.group(0).startswith('[InlineData'):
            j = text.index('(', m.start())
            end = balanced(text, j, '(', ')')
            pending.append(parse_args(text[j + 1:end]))
            i = end + 1
            continue
        name = m.group(2)
        pstart = m.end() - 1
        pend = balanced(text, pstart, '(', ')')
        params = text[pstart + 1:pend]
        # body: block or expression-bodied
        rest = text[pend + 1:]
        stripped = rest.lstrip()
        if stripped.startswith('=>'):
            k = text.index(';', pend)
            body = text[pend + 1:k + 1]
            i = k + 1
        else:
            b = text.index('{', pend)
            k = balanced(text, b, '{', '}')
            body = text[b:k + 1]
            i = k + 1
        methods.append({'kind': kind, 'name': name, 'params': ' '.join(params.split()), 'cases': pending, 'body': body})
        pending = []
        kind = None
    return methods


root = sys.argv[1]
result = {}
for path in sorted(glob.glob(os.path.join(root, '*', '*Tests.cs'))):
    result[os.path.basename(path)] = extract(path)
json.dump(result, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for f, ms in result.items():
    tests = [m for m in ms if m['kind']]
    print(f, sum(len(m['cases']) for m in ms), 'cases', len(tests), 'tests', len(ms) - len(tests), 'helpers')
