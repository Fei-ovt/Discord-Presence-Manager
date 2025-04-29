import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Since we're in an ESM environment, we'll use a simpler approach
  // First try the default port
  const defaultPort = 5000;
  
  // Try to start the server with error handling
  server.listen({
    port: defaultPort,
    host: "0.0.0.0",
  }, () => {
    log(`Serving on port ${defaultPort}`);
  });
  
  // Handle port already in use
  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      log(`Port ${defaultPort} is already in use, trying alternative port 3000...`, 'warn');
      
      // Try an alternative port
      const alternativePort = 3000;
      server.listen({
        port: alternativePort,
        host: "0.0.0.0",
      }, () => {
        log(`Serving on alternative port ${alternativePort}`);
      });
      
      // Handle error on alternative port
      server.on('error', (err2: any) => {
        if (err2.code === 'EADDRINUSE') {
          log(`Alternative port ${alternativePort} is also in use!`, 'error');
          log(`Please restart your Replit environment or manually kill processes using these ports.`, 'error');
          log(`Try running: pkill -f "node" in the shell to kill all node processes.`, 'error');
          process.exit(1);
        } else {
          log(`Server error: ${err2.message}`, 'error');
          process.exit(1);
        }
      });
    } else {
      log(`Server error: ${err.message}`, 'error');
      process.exit(1);
    }
  });
})();
