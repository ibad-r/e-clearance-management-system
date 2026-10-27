
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler";

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


app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
  });
});


app.use(errorHandler);
