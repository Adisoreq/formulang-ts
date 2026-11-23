import json, sys, os, math

cases = json.load(open(sys.argv[1], encoding='utf-8'))
out_dir = sys.argv[2]
os.makedirs(out_dir, exist_ok=True)


# Values of the C# constants used as test arguments
CONSTANTS = {
    'CoreFunctions.TimeOffsetName': 'time_offset',
}


def ts(value):
    if isinstance(value, dict):
        if value.get('expr') in CONSTANTS:
            return ts(CONSTANTS[value['expr']])
        raise Exception('expression argument: ' + json.dumps(value))
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if value is None:
        return 'null'
    if isinstance(value, float):
        if math.isinf(value):
            return 'Infinity' if value > 0 else '-Infinity'
        return repr(value)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return '[' + ', '.join(ts(v) for v in value) + ']'
    raise Exception(type(value))


def camel(name):
    return name[0].lower() + name[1:]


for file, methods in cases.items():
    data = [m for m in methods if m['cases']]
    if not data:
        continue
    base = file.replace('Tests.cs', '')
    lines = [
        '// Generated from FormuLang.NET/tests/*/' + file + ' (Adisoreq/formulang-dotnet@7e85d55).',
        '// Test cases of the reference implementation; regenerate instead of editing by hand.',
        '',
    ]
    for m in data:
        lines.append(f'/** `{m["name"]}({m["params"]})` */')
        lines.append(f'export const {camel(m["name"])} = [')
        for case in m['cases']:
            lines.append('  [' + ', '.join(ts(v) for v in case) + '],')
        lines.append('] as const;')
        lines.append('')
    path = os.path.join(out_dir, f'{base}.cases.ts')
    open(path, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))
    print(path, sum(len(m['cases']) for m in data))
