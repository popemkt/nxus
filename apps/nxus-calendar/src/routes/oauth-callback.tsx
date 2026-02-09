/**
 * oauth-callback.tsx - Google OAuth callback handler route
 *
 * Handles the redirect from Google OAuth after user authorization.
 * Exchanges the authorization code for tokens and redirects back to calendar.
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@nxus/ui'
// Import Google sync hook from server entry to avoid bundling googleapis on client
import { useGoogleConnect } from '@nxus/calendar/server'
import {
  ArrowLeftIcon,
  CheckCircle,
  CircleNotch,
  WarningCircle,
} from '@phosphor-icons/react'

export const Route = createFileRoute('/oauth-callback')({
  component: OAuthCallbackPage,
  validateSearch: (search: Record<string, unknown>) => ({
    code: search.code as string | undefined,
    error: search.error as string | undefined,
    state: search.state as string | undefined,
  }),
})

type CallbackState = 'processing' | 'success' | 'error'

function OAuthCallbackPage() {
  const navigate = useNavigate()
  const { code, error: oauthError, state: oauthState } = Route.useSearch()
  const { completeAuth, error: authError } = useGoogleConnect()

  const [callbackState, setCallbackState] = useState<CallbackState>('processing')
  const [email, setEmail] = useState<string | undefined>()
  const [errorMessage, setErrorMessage] = useState<string | undefined>()

  useEffect(() => {
    let aborted = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    async function handleCallback() {
      // Validate CSRF state token
      const storedState = localStorage.getItem('oauth_state')
      localStorage.removeItem('oauth_state')
      if (!oauthState || oauthState !== storedState) {
        if (!aborted) {
          setCallbackState('error')
          setErrorMessage('Invalid OAuth state. This may be a CSRF attempt or a stale callback. Please try connecting again.')
        }
        return
      }

      // Check for OAuth error from Google
      if (oauthError) {
        if (!aborted) {
          setCallbackState('error')
          setErrorMessage(
            oauthError === 'access_denied'
              ? 'You denied access to Google Calendar. Please try again if you want to connect.'
              : `Google returned an error: ${oauthError}`,
          )
        }
        return
      }

      // Check if we have an authorization code
      if (!code) {
        if (!aborted) {
          setCallbackState('error')
          setErrorMessage('No authorization code received from Google.')
        }
        return
      }

      try {
        // Exchange code for tokens
        const result = await completeAuth(code)
        if (aborted) return

        if (result?.email) {
          setEmail(result.email)
          setCallbackState('success')

          // Redirect to calendar after a short delay to show success message
          timeoutId = setTimeout(() => {
            if (!aborted) {
              navigate({ to: '/' })
            }
          }, 2000)
        } else {
          setCallbackState('error')
          setErrorMessage('Failed to complete authentication.')
        }
      } catch (err) {
        if (!aborted) {
          setCallbackState('error')
          setErrorMessage(
            err instanceof Error ? err.message : 'An unexpected error occurred.',
          )
        }
      }
    }

    handleCallback()

    return () => {
      aborted = true
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }
    }
  }, [code, oauthError, oauthState, completeAuth, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="rounded-lg border bg-card p-8 shadow-sm">
          {/* Processing state */}
          {callbackState === 'processing' && (
            <div className="text-center">
              <CircleNotch className="mx-auto h-12 w-12 animate-spin text-primary" />
              <h1 className="mt-4 text-xl font-semibold">
                Connecting to Google Calendar
              </h1>
              <p className="mt-2 text-muted-foreground">
                Please wait while we complete the authorization...
              </p>
            </div>
          )}

          {/* Success state */}
          {callbackState === 'success' && (
            <div className="text-center">
              <CheckCircle
                className="mx-auto h-12 w-12 text-green-500"
                weight="fill"
              />
              <h1 className="mt-4 text-xl font-semibold text-green-700">
                Successfully Connected!
              </h1>
              <p className="mt-2 text-muted-foreground">
                {email ? (
                  <>
                    Connected as <span className="font-medium">{email}</span>
                  </>
                ) : (
                  'Your Google Calendar is now connected.'
                )}
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                Redirecting to calendar...
              </p>
            </div>
          )}

          {/* Error state */}
          {callbackState === 'error' && (
            <div className="text-center">
              <WarningCircle
                className="mx-auto h-12 w-12 text-red-500"
                weight="fill"
              />
              <h1 className="mt-4 text-xl font-semibold text-red-700">
                Connection Failed
              </h1>
              <p className="mt-2 text-muted-foreground">
                {errorMessage || authError?.message || 'An error occurred.'}
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <Button onClick={() => navigate({ to: '/' })}>
                  <ArrowLeftIcon data-icon="inline-start" />
                  Back to Calendar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate({ to: '/' })}
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
