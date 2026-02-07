# useEffect Best Practices Guide

> **Last Updated:** 2025-12-26  
> **Based on:** [React Official Docs](https://react.dev/learn/you-might-not-need-an-effect) + [Kent C. Dodds: Myths about useEffect](https://www.epicreact.dev/myths-about-useeffect)

---

## The Golden Rule

> **useEffect is for synchronizing React with EXTERNAL systems, not for managing React state.**

**Think in terms of synchronization, not lifecycles.**

---

## Quick Decision Tree

```
Do you need to interact with something OUTSIDE React?
  ├─ YES → ✅ Use useEffect
  │   ├─ Fetching data from API
  │   ├─ Manipulating DOM directly
  │   ├─ Setting up event listeners
  │   ├─ Connecting to WebSocket
  │   └─ Syncing with external stores (analytics, localStorage, etc.)
  │
  └─ NO → ❌ Don't use useEffect
      ├─ Calculating derived state → use regular variable or useMemo
      ├─ Transforming data → use useMemo
      ├─ Handling user events → use event handlers
      ├─ Initializing state → use useState(() => initial)
      └─ Syncing React state → redesign your state structure
```

---

## When to Use useEffect ✅

### 1. **Fetching Data**

```typescript
useEffect(() => {
  let cancelled = false

  fetch(`/api/users/${userId}`)
    .then((res) => res.json())
    .then((data) => {
      if (!cancelled) setUser(data)
    })

  // Cleanup: cancel request if component unmounts or userId changes
  return () => {
    cancelled = true
  }
}, [userId]) // Re-fetch when userId changes
```

### 2. **DOM Manipulation**

```typescript
useEffect(() => {
  const element = document.documentElement
  if (theme === 'dark') {
    element.classList.add('dark')
  } else {
    element.classList.remove('dark')
  }
}, [theme]) // Sync DOM with React state
```

### 3. **Event Listeners**

```typescript
useEffect(() => {
  const handleResize = () => setWindowWidth(window.innerWidth)
  window.addEventListener('resize', handleResize)

  // Cleanup: remove listener on unmount
  return () => window.removeEventListener('resize', handleResize)
}, []) // Empty deps = run once on mount
```

### 4. **External Store Synchronization**

```typescript
useEffect(() => {
  if (osInfo) {
    // Sync React state with external Zustand store
    appStateService.setOsInfo(osInfo)
  }
}, [osInfo])
```

### 5. **Timers and Intervals**

```typescript
useEffect(() => {
  const timer = setInterval(() => {
    setTime(new Date())
  }, 1000)

  return () => clearInterval(timer)
}, [])
```

---

## When NOT to Use useEffect ❌

### 1. **Derived State** → Use regular variable

```typescript
// ❌ BAD
const [firstName, setFirstName] = useState('Taylor')
const [lastName, setLastName] = useState('Swift')
const [fullName, setFullName] = useState('')

useEffect(() => {
  setFullName(firstName + ' ' + lastName)
}, [firstName, lastName])

// ✅ GOOD
const [firstName, setFirstName] = useState('Taylor')
const [lastName, setLastName] = useState('Swift')
const fullName = firstName + ' ' + lastName // Just calculate it!
```

### 2. **Transforming Data** → Use useMemo

```typescript
// ❌ BAD
const [users, setUsers] = useState([])
const [activeUsers, setActiveUsers] = useState([])

useEffect(() => {
  setActiveUsers(users.filter((u) => u.isActive))
}, [users])

// ✅ GOOD
const [users, setUsers] = useState([])
const activeUsers = useMemo(() => users.filter((u) => u.isActive), [users])
```

### 3. **Event Handlers** → Use callbacks

```typescript
// ❌ BAD
const [shouldSubmit, setShouldSubmit] = useState(false)

useEffect(() => {
  if (shouldSubmit) {
    submitForm()
    setShouldSubmit(false)
  }
}, [shouldSubmit])

// ✅ GOOD
const handleSubmit = () => {
  submitForm()
}
```

### 4. **Initializing State** → Use lazy initialization

```typescript
// ❌ BAD
const [data, setData] = useState(null)

useEffect(() => {
  setData(loadData())
}, [])

// ✅ GOOD
const [data, setData] = useState(() => loadData())
```

### 5. **Syncing State with Props** → Reconsider design

```typescript
// ❌ BAD - fighting React
const [installPath, setInstallPath] = useState('')

useEffect(() => {
  setInstallPath(savedPath) // This creates bugs!
}, [savedPath])

// ✅ GOOD - calculate from props
const defaultPath = savedPath || getDefaultPath()
const [installPath, setInstallPath] = useState(defaultPath)
```

---

## Common Mistakes

### ❌ Mistake 1: Thinking in Lifecycles

**Bad mindset:** "I want this to run on mount"  
**Good mindset:** "I want to synchronize X with Y"

```typescript
// ❌ Thinking in lifecycles (componentDidMount, etc.)
useEffect(() => {
  // "I want this to run once on mount"
  fetchUser(userId)
  // eslint-disable-next-line
}, []) // This is wrong!

// ✅ Thinking in synchronization
useEffect(() => {
  // "I want to sync with the current userId"
  fetchUser(userId)
}, [userId]) // Re-sync when userId changes
```

### ❌ Mistake 2: Ignoring exhaustive-deps

**NEVER ignore this ESLint rule!** If you think you need to, you're probably doing something wrong.

```typescript
// ❌ This WILL cause bugs
useEffect(() => {
  doSomethingWith(data)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []) // Missing 'data' in deps = stale closure bug

// ✅ Include all dependencies
useEffect(() => {
  doSomethingWith(data)
}, [data])
```

**Quote from Kent C. Dodds:**

> "The question is not 'when does this effect run', the question is 'with which state does this effect synchronize with'"

### ❌ Mistake 3: Chains of Effects

```typescript
// ❌ BAD - cascading effects
const [a, setA] = useState(1)
const [b, setB] = useState(0)
const [c, setC] = useState(0)

useEffect(() => {
  setB(a * 2)
}, [a])
useEffect(() => {
  setC(b + 10)
}, [b])

// ✅ GOOD - calculate directly
const [a, setA] = useState(1)
const b = a * 2
const c = b + 10
```

### ❌ Mistake 4: One Giant useEffect

```typescript
// ❌ BAD - mixing concerns
useEffect(() => {
  // Fetching user
  fetchUser(userId)

  // Setting up analytics
  analytics.track('page_view')

  // Window listener
  window.addEventListener('resize', handleResize)

  return () => {
    window.removeEventListener('resize', handleResize)
  }
}, [userId, handleResize])

// ✅ GOOD - separate effects for separate concerns
useEffect(() => {
  fetchUser(userId)
}, [userId])

useEffect(() => {
  analytics.track('page_view')
}, [])

useEffect(() => {
  window.addEventListener('resize', handleResize)
  return () => window.removeEventListener('resize', handleResize)
}, [handleResize])
```

---

## Real-World Examples from This Codebase

### ✅ Valid: Theme Synchronization

```typescript
// theme-toggle.tsx
useEffect(() => {
  const root = window.document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  localStorage.setItem('theme', theme)
}, [theme])
```

**Why valid:** Synchronizing React state with DOM and localStorage (external systems).

### ✅ Valid: Auto-scroll

```typescript
// command-log-viewer.tsx
useEffect(() => {
  if (shouldAutoScrollRef.current && logContainerRef.current) {
    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
  }
}, [logs])
```

**Why valid:** DOM manipulation side effect triggered by state change.

### ❌ Anti-pattern Fixed: Path State

```typescript
// BEFORE (use-install-path.ts) - ❌ BAD
const [installPath, setInstallPath] = useState(getDefaultPath)

useEffect(() => {
  if (hasInitialized.current) return
  if (savedPath) {
    setInstallPath(savedPath) // This caused the input override bug!
    hasInitialized.current = true
  }
}, [savedPath, osInfo, getDefaultPath, installPath])

// AFTER - ✅ GOOD
const defaultPath = firstInstallPath || getOsDefaultWorkspacePath(osInfo)
const [installPath, setInstallPath] = useState(defaultPath)
// No useEffect needed!
```

---

## Advanced Patterns

### Pattern 1: Lazy Initialization for Sync Data

```typescript
// For synchronous data that doesn't change
const [data, setData] = useState(() => {
  // This runs only once on mount
  return expensiveCalculation()
})
```

### Pattern 2: Cleanup Functions

```typescript
useEffect(() => {
  const subscription = api.subscribe((data) => setData(data))

  // Always cleanup subscriptions, listeners, timeouts
  return () => subscription.unsubscribe()
}, [])
```

### Pattern 3: Avoiding Race Conditions

```typescript
useEffect(() => {
  let cancelled = false

  async function fetchData() {
    const result = await fetch(`/api/${id}`)
    if (!cancelled) {
      // Ignore if component unmounted
      setData(result)
    }
  }

  fetchData()

  return () => {
    cancelled = true
  }
}, [id])
```

---

## Summary Checklist

Before writing `useEffect`, ask yourself:

- [ ] Am I interacting with something OUTSIDE React? (API, DOM, browser API)
- [ ] Could this be a regular variable or `useMemo` instead?
- [ ] Could this be handled in an event handler?
- [ ] Am I trying to sync two pieces of React state? (redesign needed)
- [ ] Do I have ALL dependencies in the dependency array?
- [ ] Do I need a cleanup function?

**If you answered NO to the first question, you probably don't need useEffect!**

---

## Further Reading

- [React Docs: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [Kent C. Dodds: Myths about useEffect](https://www.epicreact.dev/myths-about-useeffect)
- [Dan Abramov: A Complete Guide to useEffect](https://overreacted.io/a-complete-guide-to-useeffect/)
