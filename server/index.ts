import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d: string) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    // Allow localhost origins for Expo web development (any port)
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

async function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  log("Serving static Expo files with dynamic manifest routing");

  // Development-only proxy to Metro bundler
  if (process.env.NODE_ENV === "development") {
    const { createProxyMiddleware } = await import("http-proxy-middleware");
    const http = await import("http");

    const metroPorts = [8081, 8082];

    async function findMetroPort(): Promise<number> {
      for (const port of metroPorts) {
        try {
          await new Promise<void>((resolve, reject) => {
            const req = http.get(`http://127.0.0.1:${port}/status`, (res: any) => {
              res.resume();
              resolve();
            });
            req.on("error", reject);
            req.setTimeout(500, () => { req.destroy(); reject(new Error("timeout")); });
          });
          return port;
        } catch {}
      }
      return 8081;
    }

    let metroPort = await findMetroPort();
    log(`Detected Metro bundler on port ${metroPort}`);

    const createMetroProxy = (port: number) => createProxyMiddleware({
      target: `http://127.0.0.1:${port}`,
      changeOrigin: true,
      ws: true,
      logLevel: "warn",
      timeout: 120000,
      proxyTimeout: 120000,
      onError: (err: any, req: any, res: any) => {
        log(`Proxy error for ${req.url}: ${err.message}`);
        if (!res.headersSent) {
          res.status(502).json({ error: "Metro bundler unavailable" });
        }
      },
    });

    let metroProxy = createMetroProxy(metroPort);

    setInterval(async () => {
      const newPort = await findMetroPort();
      if (newPort !== metroPort) {
        log(`Metro port changed: ${metroPort} -> ${newPort}`);
        metroPort = newPort;
        metroProxy = createMetroProxy(newPort);
      }
    }, 5000);

    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) {
        return next();
      }

      return metroProxy(req, res, next);
    });

    log(`Development proxy to Metro bundler (port ${metroPort}) enabled — web app available at /`);
  } else {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) {
        return next();
      }

      if (req.path !== "/" && req.path !== "/manifest") {
        return next();
      }

      const platform = req.header("expo-platform");
      if (platform && (platform === "ios" || platform === "android")) {
        return serveExpoManifest(platform, res);
      }

      if (req.path === "/") {
        return serveLandingPage({
          req,
          res,
          landingPageTemplate,
          appName,
        });
      }

      next();
    });
  }

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  await configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);

  const killPort = async (p: number) => {
    try {
      const { readFileSync, readdirSync, readlinkSync } = await import("fs");
      const portHex = p.toString(16).toUpperCase().padStart(4, "0");
      const tcp = readFileSync("/proc/net/tcp", "utf8");
      const inodes = new Set<string>();
      for (const line of tcp.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts[1]?.endsWith(`:${portHex}`) && parts[3] === "0A") {
          inodes.add(parts[9]);
        }
      }
      if (inodes.size === 0) return;
      const myPid = process.pid.toString();
      for (const entry of readdirSync("/proc").filter(e => /^\d+$/.test(e))) {
        if (entry === myPid) continue;
        try {
          const fds = readdirSync(`/proc/${entry}/fd`);
          for (const fd of fds) {
            try {
              const link = readlinkSync(`/proc/${entry}/fd/${fd}`);
              const m = link.match(/socket:\[(\d+)\]/);
              if (m && inodes.has(m[1])) {
                process.kill(parseInt(entry), "SIGTERM");
                break;
              }
            } catch {}
          }
        } catch {}
      }
    } catch {}
  };

  const tryListen = (attempt: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      const onError = async (err: NodeJS.ErrnoException) => {
        server.removeListener("error", onError);
        if (err.code === "EADDRINUSE" && attempt < 3) {
          log(`Port ${port} in use, retrying (attempt ${attempt + 1}/3)...`);
          await killPort(port);
          await new Promise((r) => setTimeout(r, 2000));
          tryListen(attempt + 1).then(resolve, reject);
        } else {
          reject(err);
        }
      };
      server.once("error", onError);
      server.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
        server.removeListener("error", onError);
        log(`express server serving on port ${port}`);
        resolve();
      });
    });
  };

  await killPort(port);
  await new Promise((r) => setTimeout(r, 800));

  try {
    await tryListen(0);
  } catch (err: any) {
    log(`Failed to start server after retries: ${err.message}`);
    process.exit(1);
  }
})();
