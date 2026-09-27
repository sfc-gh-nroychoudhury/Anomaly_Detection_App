import { NextResponse } from 'next/server';

// Referenced by containers/service_spec.yaml's readinessProbe -- must stay
// lightweight (no Snowflake calls) so the container can report healthy even
// before the app's one-time setup grants are in place.
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
