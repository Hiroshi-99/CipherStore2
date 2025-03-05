import { useEffect } from "react";

// Simple performance monitoring utility

// Create a singleton for tracking performance metrics
class PerformanceMonitor {
  private metrics: Map<
    string,
    {
      count: number;
      totalTime: number;
      min: number;
      max: number;
    }
  > = new Map();

  private timers: Map<string, number> = new Map();

  // Start timing an operation
  start(operation: string): void {
    this.timers.set(operation, performance.now());
  }

  // End timing and record the metrics
  end(operation: string): number | null {
    const startTime = this.timers.get(operation);
    if (startTime === undefined) return null;

    const endTime = performance.now();
    const duration = endTime - startTime;

    this.timers.delete(operation);

    const existing = this.metrics.get(operation) || {
      count: 0,
      totalTime: 0,
      min: Infinity,
      max: 0,
    };

    this.metrics.set(operation, {
      count: existing.count + 1,
      totalTime: existing.totalTime + duration,
      min: Math.min(existing.min, duration),
      max: Math.max(existing.max, duration),
    });

    return duration;
  }

  // Log current metrics
  logMetrics(): void {
    console.group("Performance Metrics");

    this.metrics.forEach((metric, operation) => {
      const avg = metric.totalTime / metric.count;
      console.log(
        `${operation}: count=${metric.count}, avg=${avg.toFixed(
          2
        )}ms, min=${metric.min.toFixed(2)}ms, max=${metric.max.toFixed(2)}ms`
      );
    });

    console.groupEnd();
  }

  // Clear all metrics
  clear(): void {
    this.metrics.clear();
    this.timers.clear();
  }

  // Create a wrapper to measure a function's performance
  measure<T extends (...args: any[]) => any>(
    name: string,
    fn: T
  ): (...args: Parameters<T>) => ReturnType<T> {
    return (...args: Parameters<T>): ReturnType<T> => {
      this.start(name);
      const result = fn(...args);

      // Handle promises specially
      if (result instanceof Promise) {
        return result
          .then((value) => {
            this.end(name);
            return value;
          })
          .catch((error) => {
            this.end(name);
            throw error;
          }) as ReturnType<T>;
      }

      this.end(name);
      return result;
    };
  }
}

export const performance = new PerformanceMonitor();

// Add a React hook to measure component render time
export function usePerformanceMonitor(componentName: string) {
  useEffect(() => {
    performance.start(`render_${componentName}`);

    return () => {
      performance.end(`render_${componentName}`);
    };
  });

  // Return the monitor for additional measurements
  return performance;
}
