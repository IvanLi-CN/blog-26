export type FormattedError = {
  message: string;
  details: string;
};

export function formatUnknownError(error: unknown): FormattedError {
  if (error instanceof Error) {
    return {
      message: error.message,
      details: error.stack ?? error.message,
    };
  }

  if (typeof error === "string") {
    return { message: error, details: error };
  }

  try {
    const serialized = JSON.stringify(error, null, 2);
    return { message: serialized, details: serialized };
  } catch {
    return { message: "Unknown error", details: "Unknown error" };
  }
}
