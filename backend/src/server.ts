import "dotenv/config";
import { app } from "./app";

const port = Number(process.env.PORT ?? 4000);
const host = "0.0.0.0";

app.listen({ port, host }, () => {
  console.log(`E-Clearance API running on port ${port}`);
});
