import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const html = `<!DOCTYPE html>
<html>
<head><title>SPCS Test</title></head>
<body style="font-family:system-ui;padding:40px;">
  <h1>SPCS Test Page</h1>
  <p>If you see this, the Next.js server is working.</p>
  <p>Timestamp: ${new Date().toISOString()}</p>
  <p>SNOWFLAKE_HOST: ${process.env.SNOWFLAKE_HOST ? 'SET' : 'NOT SET'}</p>
  <p>SNOWFLAKE_DATABASE: ${process.env.SNOWFLAKE_DATABASE ?? 'NOT SET'}</p>
  <script>document.body.innerHTML += '<p style="color:green;font-weight:bold;">JavaScript is working!</p>';</script>
</body>
</html>`;
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
