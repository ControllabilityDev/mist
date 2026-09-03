/**
 * A deliberately small JSON Schema validator -- the ONE copy in this repository.
 *
 * Extracted from scripts/check-ledger.mjs (EPIC-08 Phase 0e) by EPIC-03, which
 * needs the same validator for schemas/scan-run.schema.json. Two divergent
 * validators is the same hazard EPIC-08 named for two divergent secret regexes
 * (schemas/secret-patterns.json): the checks would drift and neither would be
 * citable. So there is one.
 *
 * Supported subset: $ref/$defs, oneOf, type (string or array of strings, incl.
 * "null"), required, additionalProperties:false, enum, const, minimum,
 * minLength, pattern, items.
 *
 * NOT a general JSON Schema implementation. It does not do allOf, anyOf, not,
 * format, maximum, uniqueItems, dependent schemas, or $id resolution across
 * files. It says so rather than pretending otherwise: a schema that uses an
 * unsupported keyword is silently ACCEPTED, so scripts/test-scan.mjs asserts
 * the schemas in this repository only use keywords from the list above.
 *
 * Zero dependencies, on purpose: these gates must keep working when the
 * dependency tree is too broken to install.
 */

const TYPE_OK = {
  integer: (v) => Number.isInteger(v),
  number: (v) => typeof v === "number",
  string: (v) => typeof v === "string",
  boolean: (v) => typeof v === "boolean",
  array: (v) => Array.isArray(v),
  null: (v) => v === null,
  object: (v) => typeof v === "object" && v !== null && !Array.isArray(v),
};

/** Every keyword this validator actually enforces. Anything else is ignored. */
export const SUPPORTED_KEYWORDS = new Set([
  "$ref", "$defs", "oneOf", "type", "required", "additionalProperties",
  "properties", "enum", "const", "minimum", "minLength", "pattern", "items",
  // annotation-only: carried in schemas, never enforced here
  "$schema", "$id", "$comment", "title", "description", "examples", "default",
]);

export function validate(value, schema, root, path = "") {
  if (schema.$ref) {
    const def = schema.$ref.replace(/^#\//, "").split("/").reduce((o, k) => o[k], root);
    return validate(value, def, root, path);
  }
  if (schema.oneOf) {
    const results = schema.oneOf.map((s) => validate(value, s, root, path));
    const okCount = results.filter((r) => r.length === 0).length;
    if (okCount === 1) return [];
    if (okCount > 1) return [`${path || "/"}: matches more than one record type`];
    return [`${path || "/"}: matches no record type -- ${results.flat()[0]}`];
  }
  const errs = [];
  if (schema.const !== undefined && value !== schema.const)
    errs.push(`${path}: expected ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value))
    errs.push(`${path}: ${JSON.stringify(value)} not in [${schema.enum.join(", ")}]`);
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => (TYPE_OK[t] ?? (() => true))(value)))
      errs.push(`${path}: expected ${types.join(" or ")}`);
  }
  if (errs.length) return errs;

  // Per JSON Schema, a keyword only constrains its own instance type. minimum
  // ignores non-numbers; pattern and minLength ignore non-strings. Applying
  // them regardless would make every nullable patterned field unrepresentable
  // -- which is exactly how this was first written, and the scan-run envelope
  // caught it: `counterInvariant: null` was rejected by ^CI-[1-6]$.
  if (schema.minimum !== undefined && typeof value === "number" && value < schema.minimum)
    errs.push(`${path}: ${value} < minimum ${schema.minimum}`);
  if (schema.minLength !== undefined && typeof value === "string" && value.length < schema.minLength)
    errs.push(`${path}: shorter than ${schema.minLength}`);
  if (schema.pattern && typeof value === "string" && !new RegExp(schema.pattern).test(value))
    errs.push(`${path}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
  if (schema.items && Array.isArray(value))
    value.forEach((v, i) => errs.push(...validate(v, schema.items, root, `${path}[${i}]`)));

  if (TYPE_OK.object(value) && (schema.type === "object" || schema.properties)) {
    for (const key of schema.required ?? [])
      if (!(key in value)) errs.push(`${path}: missing required field "${key}"`);
    if (schema.additionalProperties === false)
      for (const key of Object.keys(value))
        if (!(key in (schema.properties ?? {}))) errs.push(`${path}: unknown field "${key}"`);
    for (const [key, sub] of Object.entries(schema.properties ?? {}))
      if (key in value) errs.push(...validate(value[key], sub, root, `${path}.${key}`));
  }
  return errs;
}

/**
 * Walks a schema and returns every keyword used that validate() does not
 * enforce. Guards the silent-accept failure mode above.
 */
export function unsupportedKeywords(schema, path = "#", out = []) {
  if (schema === null || typeof schema !== "object") return out;
  if (Array.isArray(schema)) {
    schema.forEach((s, i) => unsupportedKeywords(s, `${path}[${i}]`, out));
    return out;
  }
  for (const [key, sub] of Object.entries(schema)) {
    const isContainer = key === "properties" || key === "$defs";
    if (!isContainer && !SUPPORTED_KEYWORDS.has(key)) out.push(`${path}/${key}`);
    if (isContainer) for (const [k, s] of Object.entries(sub)) unsupportedKeywords(s, `${path}/${key}/${k}`, out);
    else unsupportedKeywords(sub, `${path}/${key}`, out);
  }
  return out;
}
