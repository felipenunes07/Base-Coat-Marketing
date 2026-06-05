import { NextRequest, NextResponse } from 'next/server';
import { getSourcePerformance } from '@/lib/source-performance';

export async function GET(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.replace(/^Bearer\s+/i, '');
  const start = request.nextUrl.searchParams.get('start');
  const end = request.nextUrl.searchParams.get('end');

  if (!token) return NextResponse.json({ error: 'Missing bearer token.' }, { status: 401 });
  if (!start || !end) return NextResponse.json({ error: 'Missing start or end date.' }, { status: 400 });

  try {
    return NextResponse.json(await getSourcePerformance(token, start, end));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load performance.' },
      { status: 500 }
    );
  }
}
