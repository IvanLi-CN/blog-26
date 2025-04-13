import { exit } from "node:process";
import { Observable, shareReplay } from "rxjs";

export const exit$ = new Observable<void>((observer) => {
  for (const signal of ["SIGINT", "SIGTERM", "SIGQUIT"]) {
    process.on(signal, () => {
      console.log(`Received ${signal} signal`);
      observer.next();
      observer.complete();
      exit(0);
    });
  }

  process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    observer.next();
    observer.complete();
    exit(1);
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    observer.next();
    observer.complete();
    exit(1);
  });
}).pipe(shareReplay());
