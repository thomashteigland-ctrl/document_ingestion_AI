// src/pages/UsagePage.tsx
import { useEffect, useState } from 'react';

interface TokenUsage {
  date: string;
  tokens: number;
}

export default function UsagePage() {
  const [usage, setUsage] = useState<TokenUsage[]>([]);

  useEffect(() => {
    // Dummy data
    setUsage([
      { date: '2025-10-01', tokens: 120 },
      { date: '2025-10-02', tokens: 95 },
      { date: '2025-10-03', tokens: 150 },
    ]);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Usage Dashboard</h1>
      <table className="table-auto border-collapse border border-gray-300">
        <thead>
          <tr>
            <th className="border px-4 py-2">Date</th>
            <th className="border px-4 py-2">Tokens</th>
          </tr>
        </thead>
        <tbody>
          {usage.map((u) => (
            <tr key={u.date}>
              <td className="border px-4 py-2">{u.date}</td>
              <td className="border px-4 py-2">{u.tokens}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
