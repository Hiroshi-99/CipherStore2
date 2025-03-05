import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Database, Server } from "lucide-react";

const HealthIndicator = () => {
  const [dbStatus, setDbStatus] = useState<"checking" | "ok" | "error">(
    "checking"
  );
  const [serverlessStatus, setServerlessStatus] = useState<
    "checking" | "ok" | "error"
  >("checking");

  useEffect(() => {
    // Check database connection
    const checkDb = async () => {
      try {
        const start = Date.now();
        const response = await fetch("/api/health-check-db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timestamp: start }),
        });

        setDbStatus(response.ok ? "ok" : "error");
      } catch (e) {
        setDbStatus("error");
      }
    };

    // Check serverless functions
    const checkServerless = async () => {
      try {
        const response = await fetch("/.netlify/functions/health-check");
        setServerlessStatus(response.ok ? "ok" : "error");
      } catch (e) {
        setServerlessStatus("error");
      }
    };

    checkDb();
    checkServerless();
  }, []);

  return (
    <div className="flex gap-3 text-xs">
      <div className="flex items-center gap-1">
        <Database size={14} />
        {dbStatus === "checking" && <span>Checking...</span>}
        {dbStatus === "ok" && (
          <CheckCircle size={14} className="text-green-500" />
        )}
        {dbStatus === "error" && (
          <AlertCircle size={14} className="text-red-500" />
        )}
      </div>
      <div className="flex items-center gap-1">
        <Server size={14} />
        {serverlessStatus === "checking" && <span>Checking...</span>}
        {serverlessStatus === "ok" && (
          <CheckCircle size={14} className="text-green-500" />
        )}
        {serverlessStatus === "error" && (
          <AlertCircle size={14} className="text-red-500" />
        )}
      </div>
    </div>
  );
};

export default HealthIndicator;
