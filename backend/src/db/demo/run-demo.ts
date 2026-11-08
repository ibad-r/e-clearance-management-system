import { runDemoCommand } from "./demo-commands";
import { formatSafeError } from "../../utils/safe-error";

void runDemoCommand(process.argv[2], process.argv.slice(3))
  .then((summary) => console.log(JSON.stringify(summary, null, 2)))
  .catch((error: unknown) => {
    // Never emit raw driver errors, connection URLs or credentials.
    console.error(`Demo command failed: ${formatSafeError(error)}`);
    process.exitCode = 1;
  });
