'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isAdmin } from '@/lib/admin/isAdmin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { ShieldAlert, AlertTriangle } from '@/lib/icons'

interface ErrorLogRow {
  id: string
  message: string
  route: string | null
  source: string
  stack_head: string | null
  created_at: string
}

interface ErrorGroup {
  message: string
  count: number
  lastSeen: string
  sampleRoute: string | null
  source: string
  stackHead: string | null
}

export default function AdminErrorsPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [rows, setRows] = useState<ErrorLogRow[]>([])
  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const ok = await isAdmin()
      setAuthorized(ok)
      if (!ok) return
      const { data } = await supabase
        .from('error_logs')
        .select('id, message, route, source, stack_head, created_at')
        .order('created_at', { ascending: false })
        .limit(500)
      if (data) setRows(data as ErrorLogRow[])
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const groups = useMemo<ErrorGroup[]>(() => {
    const map = new Map<string, ErrorGroup>()
    for (const row of rows) {
      const existing = map.get(row.message)
      if (existing) {
        existing.count += 1
        if (row.created_at > existing.lastSeen) {
          existing.lastSeen = row.created_at
          existing.sampleRoute = row.route
          existing.source = row.source
          existing.stackHead = row.stack_head
        }
      } else {
        map.set(row.message, {
          message: row.message,
          count: 1,
          lastSeen: row.created_at,
          sampleRoute: row.route,
          source: row.source,
          stackHead: row.stack_head,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [rows])

  if (authorized === null) {
    return <div className="text-center py-10">Loading...</div>
  }

  if (!authorized) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900">Not authorized</h1>
        <p className="text-gray-600 mt-2">This area is restricted to platform administrators.</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Errors</h1>
      <p className="text-gray-600 mb-6">
        Client, server, and reconcile errors from the last 500 log rows, grouped by message, most
        frequent first.
      </p>

      <div className="space-y-4">
        {groups.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">No errors logged.</CardContent>
          </Card>
        )}
        {groups.map((group) => (
          <Card key={group.message}>
            <CardHeader>
              <CardTitle className="text-base flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-primary mt-1 shrink-0" />
                <span className="break-words">{group.message}</span>
                <span className="ml-auto shrink-0 text-xs font-normal text-gray-500">
                  {group.count} x
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Source: <span className="font-medium text-charcoal">{group.source}</span>
                {group.sampleRoute && (
                  <>
                    {' '}
                    Route: <span className="font-medium text-charcoal">{group.sampleRoute}</span>
                  </>
                )}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Last seen: {new Date(group.lastSeen).toLocaleString()}
              </p>
              {group.stackHead && (
                <pre className="text-xs text-gray-600 mt-3 bg-gray-50 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words">
                  {group.stackHead.slice(0, 800)}
                </pre>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
