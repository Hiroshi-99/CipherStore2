import React, { useEffect, useRef } from "react";

interface Firefly {
  x: number;
  y: number;
  size: number;
  speed: number;
  angle: number;
  opacity: number;
}

const Fireflies: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to window size
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    handleResize();
    window.addEventListener("resize", handleResize);

    // Create fireflies
    const fireflies: Firefly[] = Array.from({ length: 50 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 2 + 1,
      speed: Math.random() * 0.5 + 0.2,
      angle: Math.random() * Math.PI * 2,
      opacity: Math.random(),
    }));

    // Animation function
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      fireflies.forEach((firefly) => {
        // Update position
        firefly.x += Math.cos(firefly.angle) * firefly.speed;
        firefly.y += Math.sin(firefly.angle) * firefly.speed;

        // Bounce off edges
        if (firefly.x < 0 || firefly.x > canvas.width) {
          firefly.angle = Math.PI - firefly.angle;
        }
        if (firefly.y < 0 || firefly.y > canvas.height) {
          firefly.angle = -firefly.angle;
        }

        // Update opacity with sine wave
        firefly.opacity = (Math.sin(Date.now() / 1000) + 1) / 2;

        // Draw firefly
        ctx.beginPath();
        ctx.arc(firefly.x, firefly.y, firefly.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(154, 230, 180, ${firefly.opacity * 0.5})`; // Emerald color
        ctx.fill();

        // Draw glow
        const gradient = ctx.createRadialGradient(
          firefly.x,
          firefly.y,
          0,
          firefly.x,
          firefly.y,
          firefly.size * 4
        );
        gradient.addColorStop(
          0,
          `rgba(154, 230, 180, ${firefly.opacity * 0.3})`
        );
        gradient.addColorStop(1, "rgba(154, 230, 180, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(firefly.x, firefly.y, firefly.size * 4, 0, Math.PI * 2);
        ctx.fill();
      });

      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-10"
      style={{ mixBlendMode: "screen" }}
    />
  );
};

export default Fireflies;
