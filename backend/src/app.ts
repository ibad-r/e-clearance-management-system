
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";

export const app = express();


app.use(helmet());
app.use(cors());
app.use(express.json());


app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "e-clearance-backend",
  });
});
app.use("/api/v1/auth", authRouter);


app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
  });
});


app.use(errorHandler);
