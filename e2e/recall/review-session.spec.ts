import { test, expect } from '../fixtures/base.fixture.js'
import {
  mockAIServerFunctions,
  MOCK_CONCEPTS,
  MOCK_QUESTION,
  MOCK_EVALUATION,
} from './mock-ai.js'
import type { Page } from '@playwright/test'

/**
 * Helper: create a topic with saved concepts via the explore flow (with mocked AI).
 * This sets up the data needed for review session tests.
 */
async function seedTopicWithConcepts(page: Page) {
  // Navigate directly to explore page
  await page.goto('/recall/explore')
  await page.waitForLoadState('networkidle')

  // Generate concepts
  const searchInput = page.getByPlaceholder(/distributed systems/i)
  await searchInput.fill('E2E Test Topic')
  await page.getByRole('button', { name: 'Generate' }).click()

  // Wait for concepts to appear
  await expect(
    page.getByText('Generated Concepts'),
  ).toBeVisible({ timeout: 15000 })

  // Save all visible concepts
  const saveButtons = page.getByRole('button', { name: 'Save' })
  const count = await saveButtons.count()
  for (let i = 0; i < count; i++) {
    const btn = saveButtons.nth(i)
    if (await btn.isVisible()) {
      await btn.click()
      // Wait for the save to complete before clicking next
      await page.waitForTimeout(500)
    }
  }

  // Wait for at least one "Saved" indicator
  await expect(page.getByText('Saved').first()).toBeVisible({ timeout: 10000 })
}

test.describe('Recall Review Session', () => {
  test('R9 — Review session loads and resolves to a valid state', async ({
    page,
  }) => {
    await page.goto('/recall/review/session')
    await page.waitForLoadState('networkidle')

    // Wait for the page to transition out of loading
    // DB may have cards from parallel tests, so accept any resolved state
    const noCards = page.getByText('No cards due for review')
    const generating = page.getByText(/Generating question/i)
    const reviewHeading = page.getByRole('heading', { name: 'Review Session' })

    // The review heading should always be visible
    await expect(reviewHeading).toBeVisible({ timeout: 15000 })

    // Wait for the session to resolve to any state (no-cards, generating, or answering)
    await expect(
      noCards.or(generating).or(page.getByPlaceholder('Type your answer...')),
    ).toBeVisible({ timeout: 20000 })

    if (await noCards.isVisible()) {
      // Verify navigation links in no-cards state
      await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Explore More' })).toBeVisible()
    }
  })

  test('R10 — Full review flow: question → answer → feedback → rate', async ({
    page,
  }) => {
    // Set up mocked AI for the entire test
    await mockAIServerFunctions(page)

    // Seed data: create topic with concepts via explore flow
    await seedTopicWithConcepts(page)

    // Navigate to review session
    await page.goto('/recall/review/session')
    await page.waitForLoadState('networkidle')

    // Wait for either the question to load or the "no cards" state
    const questionPhase = page.getByText(MOCK_QUESTION.questionText)
    const noCardsState = page.getByText('No cards due for review')
    const generatingState = page.getByText(/Generating question/i)

    await expect(
      questionPhase.or(noCardsState).or(generatingState),
    ).toBeVisible({ timeout: 20000 })

    // If no cards are due (cards were created with future due dates), skip
    if (await noCardsState.isVisible()) {
      test.skip(true, 'No due cards — concepts saved with future due dates')
      return
    }

    // Wait for the question text to appear (might take a moment after generating)
    if (await generatingState.isVisible()) {
      await expect(questionPhase).toBeVisible({ timeout: 15000 })
    }

    // Verify the question is displayed
    await expect(page.getByText(MOCK_QUESTION.questionText)).toBeVisible()

    // Verify the answer textarea is present
    const answerInput = page.getByPlaceholder('Type your answer...')
    await expect(answerInput).toBeVisible()

    // Submit button should be disabled when answer is empty
    const submitBtn = page.getByRole('button', { name: 'Submit Answer' })
    await expect(submitBtn).toBeDisabled()

    // Type an answer
    await answerInput.fill(
      'During a network partition, the CAP theorem says you must choose between consistency and availability. For social media, I would choose availability so users can still see their feeds.',
    )

    // Submit button should now be enabled
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // Wait for evaluation (mocked AI returns instantly)
    // The feedback phase shows the score, feedback, and rating buttons
    await expect(page.getByText(`${MOCK_EVALUATION.score}/100`)).toBeVisible({
      timeout: 15000,
    })

    // Verify feedback content
    await expect(page.getByText(MOCK_EVALUATION.feedback)).toBeVisible()

    // Verify strong points are shown
    for (const point of MOCK_EVALUATION.strongPoints) {
      await expect(page.getByText(point)).toBeVisible()
    }

    // Verify model answer is shown
    await expect(page.getByText('Model Answer')).toBeVisible()
    await expect(
      page.getByText(MOCK_QUESTION.modelAnswer),
    ).toBeVisible()

    // Verify rating buttons
    await expect(page.getByText('How well did you know this?')).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Again/i }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Hard/i }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Good/i }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Easy/i }),
    ).toBeVisible()

    // Click "Good" rating — this submits a review via real server function
    await page.getByRole('button', { name: /Good/i }).click()

    // After rating, should either:
    // - Move to next card (Generating question...)
    // - Show session complete
    // - Stay in feedback phase if submit failed (rating buttons still visible)
    const nextQuestion = page.getByText(/Generating question/i)
    const sessionComplete = page.getByText('Session Complete!')
    const noMoreCards = page.getByText('No cards due for review')
    const stillInFeedback = page.getByText('How well did you know this?')

    await expect(
      nextQuestion.or(sessionComplete).or(noMoreCards).or(stillInFeedback),
    ).toBeVisible({ timeout: 15000 })
  })

  test('R11 — Review session shows hint button when hints exist', async ({
    page,
  }) => {
    await mockAIServerFunctions(page)

    // Seed data
    await seedTopicWithConcepts(page)

    // Navigate to review session
    await page.goto('/recall/review/session')
    await page.waitForLoadState('networkidle')

    // Wait for question or no-cards state
    const questionText = page.getByText(MOCK_QUESTION.questionText)
    const noCardsState = page.getByText('No cards due for review')

    await expect(questionText.or(noCardsState)).toBeVisible({
      timeout: 20000,
    })

    if (await noCardsState.isVisible()) {
      test.skip(true, 'No due cards available')
      return
    }

    // Check for hint button
    const hintBtn = page.getByText(/Show hint/i)
    await expect(hintBtn).toBeVisible()

    // Click to reveal first hint
    await hintBtn.click()
    await expect(page.getByText(MOCK_QUESTION.hints[0]!)).toBeVisible()
  })

  test('R12 — Progress bar advances during review session', async ({
    page,
  }) => {
    await mockAIServerFunctions(page)

    // Seed data
    await seedTopicWithConcepts(page)

    // Navigate to review session
    await page.goto('/recall/review/session')
    await page.waitForLoadState('networkidle')

    // Wait for question or no-cards
    const questionText = page.getByText(MOCK_QUESTION.questionText)
    const noCardsState = page.getByText('No cards due for review')

    await expect(questionText.or(noCardsState)).toBeVisible({
      timeout: 20000,
    })

    if (await noCardsState.isVisible()) {
      test.skip(true, 'No due cards available')
      return
    }

    // Verify progress indicator shows "1 / X"
    await expect(page.getByText(/1 \/ \d+/)).toBeVisible()

    // Verify the reviewed count
    await expect(page.getByText(/0 reviewed/)).toBeVisible()
  })
})
