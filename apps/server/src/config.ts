import { isAbsolute, join } from "node:path";
import { z } from "zod";

const configSchema = z.object({
  PORT: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine((port) => port >= 1 && port <= 65535, {
      message: "PORT must be between 1 and 65535",
    })
    .default("25081"),

  BUFFER_SIZE: z
    .string()
    .regex(/^\d+$/)
    .default("1800") // 30 minutes, one item per second
    .transform(Number)
    .refine((port) => port >= 0 && port <= 65535, {
      message: "MQTT_BUFFER_SIZE must be between 1 and 65535",
    }),

  DB_PATH: z
    .string()
    .default("./db.sqlite")
    .transform((path) => {
      if (isAbsolute(path)) {
        return path;
      }

      return join(process.cwd(), path);
    }),
});

export const config = configSchema.parse(process.env);
