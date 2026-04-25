# Optimizing EnumList Queries

## Problem

Currently, appsheet apps can have EnumList columns. These columns are stored as arrays in the generated databases. The challenge is that appsheet has no native expression for working with enum lists as arrays. This matters because in appsheet, when you want to write an expression that queries a table and filters on an enumlist column, you have to turn the enumlist into a string and then split that string into an array of values... This does not translate well to SQL queries. We should be able to use the array operators in SQL to query enumlist columns directly.

## Current State

EnumList columns are already stored as **native PostgreSQL arrays** (`text[]` or `pgEnum[].array()`) via Drizzle ORM. The schema generation in `drizzleTypeMapping.ts` correctly creates array columns:

```typescript
// With known enum values → pgEnum('colName').array()
// Without enum values   → text('colName').array()
```

Drizzle operator mappings for `arrayContains` (PostgreSQL `@>`) and `arrayOverlaps` (PostgreSQL `&&`) already exist in `drizzleOperatorMapping.ts`:

```typescript
export const COLLECTION_OPERATORS = [
  { keyword: 'CONTAINS', drizzle: 'arrayContains' },
  { keyword: 'OVERLAPS', drizzle: 'arrayOverlaps' },
  // ...
];
```

**However, these operators are never used.** The expression compiler and filter protocol fall back to string-based operations everywhere:

| Layer | Current Behavior | File |
|-------|-----------------|------|
| SQL expression evaluator | `CONTAINS(col, val)` → `col ILIKE '%val%'` (string match) | `drizzleExpressionEvaluator.ts:510-513` |
| JS condition compiler | `CONTAINS(col, val)` → `String(col).toLowerCase().includes(val)` | `drizzleExpressionEvaluator.ts:1875-1877` |
| SQL `IN()` | Only supports `IN(val, LIST(...))` literal expansion, not array membership | `drizzleExpressionEvaluator.ts:590-603` |
| Structured filter protocol | `FilterOp` has no array operators (`arrayContains`, `arrayOverlaps`) | `query-resolver.ts:5-16` |
| Generated `parseFilter()` | No `arrayContains`/`arrayOverlaps` cases | `structuredFilter.ts:47-61` |
| Condition compiler (chained refs) | EnumList treated as array for `.map()` iteration but not for filtering | `conditionCompiler.ts:901-903` |

## Solution

Make the expression compiler **column-type-aware** so that when `CONTAINS`, `IN`, or equality checks target an EnumList column, the compiler emits PostgreSQL array operators instead of string operations. The Drizzle operator mappings already exist — they just need to be wired in.

### Key Transformations

| AppSheet Expression | Current SQL Output | Desired SQL Output |
|---|---|---|
| `CONTAINS([Tags], "urgent")` | `tags ILIKE '%urgent%'` | `tags @> ARRAY['urgent']` (arrayContains) |
| `IN("urgent", [Tags])` | unsupported (returns null) | `'urgent' = ANY(tags)` |
| `[Tags] = LIST("a", "b")` | string equality | `tags @> ARRAY['a','b']` (arrayContains) |
| `NOT(ISBLANK([Tags]))` | `tags IS NOT NULL` | `tags IS NOT NULL AND tags != '{}'` (also check empty array) |
| Filter API: `{field: "tags", op: "contains", value: "urgent"}` | not supported | `arrayContains(col, ['urgent'])` |
| Filter API: `{field: "tags", op: "overlaps", value: ["a","b"]}` | not supported | `arrayOverlaps(col, ['a','b'])` |

### Design Principles

1. **Column-type detection at compile time** — The expression evaluator already has access to column metadata via `this.app.tables`. Use `column.type.columnType === 'EnumList'` or `column.type.baseType === 'EnumList'` to branch.
2. **No breaking changes** — String-based `CONTAINS`/`IN` continues to work for non-array columns. Array operators only activate when the target column is an EnumList.
3. **Leverage existing infrastructure** — Use the `mapCollectionToDrizzle()` mappings that already exist. Use the `arrayContains`/`arrayOverlaps` Drizzle functions that are already in the `DrizzleFilterFn` type.

## Implementation

### 1. Expression Evaluator: Array-Aware `CONTAINS` (drizzleExpressionEvaluator.ts)

**File:** `packages/app-generator/src/parser/drizzleExpressionEvaluator.ts`

**SQL-mode `CONTAINS` (line 510):** Before compiling to `ILIKE`, check if the first argument resolves to an EnumList column. If so, emit `@>` (arrayContains) instead:

```
// Pseudocode for the change:
case 'CONTAINS': {
  const str = compile(rawArgs[0]), search = compile(rawArgs[1]);
  if (!str || !search) return null;

  // NEW: detect if first arg is an EnumList column
  if (str.isRef && this.isEnumListColumn(str)) {
    // Emit: col @> ARRAY[search]
    return sqlResult(`(${this.embedSql(str)} @> ARRAY[${this.embedSql(search)}])`, str, search);
  }

  // Existing string fallback
  return sqlResult(`(${this.embedSql(str)} ILIKE '%' || ${this.embedSql(search)} || '%')`, str, search);
}
```

**JS-mode `CONTAINS` (line 1875):** Similarly, check column type and emit `Array.includes()` instead of `String.includes()`:

```
case 'CONTAINS':
  if (this.isEnumListColumn(rawArgs[0])) {
    return `(Array.isArray(${args[0]}) && ${args[0]}.includes(${args[1]}))`;
  }
  return `(String((${args[0]}) ?? '').toLowerCase().includes(...))`;
```

**Helper needed:** Add an `isEnumListColumn(node)` method that resolves a FieldReference AST node to its column metadata and checks `columnType === 'EnumList'` or `baseType === 'EnumList'`.

### 2. Expression Evaluator: Array-Aware `IN` (drizzleExpressionEvaluator.ts)

**File:** `packages/app-generator/src/parser/drizzleExpressionEvaluator.ts`

**SQL-mode `IN` (line 590):** Currently only handles `IN(val, LIST(...))`. Add a branch for `IN(val, enumListColumn)`:

```
case 'IN': {
  // Existing: IN(val, LIST(...)) → val IN (a, b, c)
  // NEW: IN(val, enumListCol) → val = ANY(enumListCol)
  if (rawArgs[1].type === 'FieldReference' && this.isEnumListColumn(rawArgs[1])) {
    const val = compile(rawArgs[0]);
    const arr = compile(rawArgs[1]);
    return sqlResult(`(${this.embedSql(val)} = ANY(${this.embedSql(arr)}))`, val, arr);
  }
  // ... existing LIST() expansion
}
```

### 3. Extend Filter Protocol (query-resolver.ts + structuredFilter.ts)

**File:** `packages/shared/src/types/query-resolver.ts`

Add `arrayContains` and `arrayOverlaps` to `FilterOpSchema`:

```typescript
export const FilterOpSchema = z.enum([
  "eq", "ne", "gt", "gte", "lt", "lte",
  "ilike", "in", "isNull", "isNotNull",
  "arrayContains",   // NEW: col @> ARRAY[val]
  "arrayOverlaps",   // NEW: col && ARRAY[val1, val2]
]);
```

**File:** `packages/app-generator/src/generators/api-generator/structuredFilter.ts`

Add cases to the generated `parseFilter()` switch:

```typescript
case 'arrayContains': {
  const vals = Array.isArray(val) ? val : [val];
  return arrayContains(col, vals);
}
case 'arrayOverlaps': {
  const vals = Array.isArray(val) ? val : String(val).split(',').map(v => v.trim());
  return arrayOverlaps(col, vals);
}
```

This also requires adding `arrayContains` and `arrayOverlaps` to the Drizzle imports in the generated API code.

### 4. API Generator: Import Array Operators (ApiGenerator.ts)

**File:** `packages/app-generator/src/generators/api-generator/ApiGenerator.ts`

Ensure the generated controller files import `arrayContains` and `arrayOverlaps` from `drizzle-orm` when the table has EnumList columns. The `buildFilterImport()` utility in `drizzleOperatorMapping.ts` already supports this — just add these function names to the import set when EnumList columns are present.

### 5. Condition Compiler: Array-Aware JS (conditionCompiler.ts)

**File:** `packages/app-generator/src/parser/conditionCompiler.ts`

The condition compiler already detects EnumList columns at line 901 for chained references. Extend this pattern to `CONTAINS` and `IN` compilation so the JS-side code uses `Array.includes()` for EnumList columns.

### Files to Modify

| File | Change |
|------|--------|
| `packages/app-generator/src/parser/drizzleExpressionEvaluator.ts` | Array-aware `CONTAINS` and `IN` in both SQL and JS modes |
| `packages/app-generator/src/parser/conditionCompiler.ts` | Array-aware JS compilation for `CONTAINS`/`IN` |
| `packages/shared/src/types/query-resolver.ts` | Add `arrayContains`, `arrayOverlaps` to `FilterOp` |
| `packages/app-generator/src/generators/api-generator/structuredFilter.ts` | Add `arrayContains`, `arrayOverlaps` cases to generated `parseFilter()` |
| `packages/app-generator/src/generators/api-generator/ApiGenerator.ts` | Import array operators when EnumList columns present |

### Testing Strategy

1. **Unit tests** in `drizzleExpressionEvaluator.test.ts` — compile `CONTAINS([EnumListCol], "val")` and assert it produces `@>` instead of `ILIKE`
2. **Unit tests** for `IN([val], [EnumListCol])` → assert `= ANY(...)` output
3. **Integration test** — generate an app from a manifest with EnumList columns, verify the generated API code includes `arrayContains` imports and the filter endpoint accepts `arrayContains` operator
4. **Regression** — ensure `CONTAINS` on regular text columns still produces `ILIKE`