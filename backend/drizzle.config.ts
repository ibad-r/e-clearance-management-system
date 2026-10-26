// Generation-only configuration: no credentials or application connection imports.
// Migration application will be configured separately after review.
export default {
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
};
