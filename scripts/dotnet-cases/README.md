# Test cases of FormuLang.NET

Generates the data tables of the conformance tests (`tests/conformance/data/*.cases.ts`) from the test sources of [FormuLang.NET](https://github.com/Adisoreq/formulang-dotnet): the arguments of every `[InlineData]` attribute of `tests/*/*Tests.cs`, one exported table per test method.

```bash
python extract.py <FormuLang.NET>/tests cases.json
python generate.py cases.json ../../tests/conformance/data
```

Update the revision of FormuLang.NET in `generate.py` (and in `docs/conformance.md`) when the tables are regenerated.
