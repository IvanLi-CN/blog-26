"use client";

import { trpc } from "@/lib/trpc";

export default function Home() {
  const { data: health } = trpc.health.useQuery();
  const { data: hello } = trpc.hello.useQuery({ name: "Next.js" });

  return (
    <div className="min-h-screen p-8">
      <main className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Ivan's Blog</h1>
        <p className="text-lg mb-4">
          Welcome to the new Next.js version of Ivan's Blog!
        </p>

        <div className="bg-gray-100 p-4 rounded-lg mb-4">
          <h2 className="text-xl font-semibold mb-2">tRPC Status</h2>
          <p>Health Check: {health ? health.status : "Loading..."}</p>
          <p>Hello Message: {hello ? hello.message : "Loading..."}</p>
        </div>

        <div className="bg-blue-50 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Migration Status</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>✅ Next.js 15 project created</li>
            <li>✅ Core dependencies installed</li>
            <li>✅ tRPC setup completed</li>
            <li>✅ Database schema defined</li>
            <li>✅ Basic configuration files created</li>
            <li>🔄 Ready for component migration from old Astro project</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
