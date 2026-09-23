;; leash.clar
;; Spending policies for AI agents. An owner funds a policy for an agent key.
;; The agent can only pay allowlisted recipients, within a per payment cap and
;; a budget that resets every period. The owner can pause, revoke and withdraw.

(define-constant ERR_NOT_OWNER (err u100))
(define-constant ERR_POLICY_EXISTS (err u101))
(define-constant ERR_NO_POLICY (err u102))
(define-constant ERR_PAUSED (err u103))
(define-constant ERR_RECIPIENT_NOT_ALLOWED (err u104))
(define-constant ERR_OVER_TX_CAP (err u105))
(define-constant ERR_OVER_PERIOD_CAP (err u106))
(define-constant ERR_INSUFFICIENT_BALANCE (err u107))
(define-constant ERR_INVALID_AMOUNT (err u108))
(define-constant ERR_INVALID_LIMITS (err u109))
(define-constant ERR_TOO_MANY_AGENTS (err u110))

(define-map policies
  principal
  {
    owner: principal,
    balance: uint,
    tx-cap: uint,
    period-cap: uint,
    period-length: uint,
    period-start: uint,
    period-spent: uint,
    active: bool,
    payments: uint,
  }
)

(define-map allowed
  {
    agent: principal,
    recipient: principal,
  }
  bool
)

(define-map owner-agents
  principal
  (list 20 principal)
)

(define-private (valid-limits
    (tx-cap uint)
    (period-cap uint)
    (period-length uint)
  )
  (and (> tx-cap u0) (>= period-cap tx-cap) (> period-length u0))
)

(define-private (owned-policy (agent principal))
  (let ((policy (unwrap! (map-get? policies agent) ERR_NO_POLICY)))
    (asserts! (is-eq contract-caller (get owner policy)) ERR_NOT_OWNER)
    (ok policy)
  )
)

;; Budget view after rolling the period forward if it has expired.
(define-private (current-window (policy {
  owner: principal,
  balance: uint,
  tx-cap: uint,
  period-cap: uint,
  period-length: uint,
  period-start: uint,
  period-spent: uint,
  active: bool,
  payments: uint,
}))
  (if (>= stacks-block-time
      (+ (get period-start policy) (get period-length policy))
    )
    {
      start: stacks-block-time,
      spent: u0,
    }
    {
      start: (get period-start policy),
      spent: (get period-spent policy),
    }
  )
)

(define-public (create-policy
    (agent principal)
    (tx-cap uint)
    (period-cap uint)
    (period-length uint)
    (initial-deposit uint)
  )
  (let ((owner contract-caller))
    (asserts! (is-none (map-get? policies agent)) ERR_POLICY_EXISTS)
    (asserts! (valid-limits tx-cap period-cap period-length) ERR_INVALID_LIMITS)
    (asserts! (> initial-deposit u0) ERR_INVALID_AMOUNT)
    (try! (stx-transfer? initial-deposit owner current-contract))
    (map-set owner-agents owner
      (unwrap!
        (as-max-len?
          (append (default-to (list) (map-get? owner-agents owner)) agent)
          u20
        )
        ERR_TOO_MANY_AGENTS
      ))
    (map-set policies agent {
      owner: owner,
      balance: initial-deposit,
      tx-cap: tx-cap,
      period-cap: period-cap,
      period-length: period-length,
      period-start: stacks-block-time,
      period-spent: u0,
      active: true,
      payments: u0,
    })
    (print {
      event: "policy-created",
      owner: owner,
      agent: agent,
      deposit: initial-deposit,
      tx-cap: tx-cap,
      period-cap: period-cap,
      period-length: period-length,
    })
    (ok true)
  )
)

(define-public (deposit
    (agent principal)
    (amount uint)
  )
  (let ((policy (try! (owned-policy agent))))
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (try! (stx-transfer? amount contract-caller current-contract))
    (map-set policies agent
      (merge policy { balance: (+ (get balance policy) amount) })
    )
    (print {
      event: "deposit",
      agent: agent,
      amount: amount,
    })
    (ok true)
  )
)

(define-public (withdraw
    (agent principal)
    (amount uint)
  )
  (let (
      (policy (try! (owned-policy agent)))
      (owner (get owner policy))
    )
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (<= amount (get balance policy)) ERR_INSUFFICIENT_BALANCE)
    (try! (as-contract? ((with-stx amount))
      (try! (stx-transfer? amount tx-sender owner))
    ))
    (map-set policies agent
      (merge policy { balance: (- (get balance policy) amount) })
    )
    (print {
      event: "withdraw",
      agent: agent,
      amount: amount,
    })
    (ok true)
  )
)

(define-public (set-limits
    (agent principal)
    (tx-cap uint)
    (period-cap uint)
    (period-length uint)
  )
  (let ((policy (try! (owned-policy agent))))
    (asserts! (valid-limits tx-cap period-cap period-length) ERR_INVALID_LIMITS)
    (map-set policies agent
      (merge policy {
        tx-cap: tx-cap,
        period-cap: period-cap,
        period-length: period-length,
      })
    )
    (print {
      event: "limits-updated",
      agent: agent,
      tx-cap: tx-cap,
      period-cap: period-cap,
      period-length: period-length,
    })
    (ok true)
  )
)

(define-public (set-recipient
    (agent principal)
    (recipient principal)
    (is-allowed bool)
  )
  (begin
    (try! (owned-policy agent))
    (map-set allowed {
      agent: agent,
      recipient: recipient,
    }
      is-allowed
    )
    (print {
      event: "recipient-updated",
      agent: agent,
      recipient: recipient,
      allowed: is-allowed,
    })
    (ok true)
  )
)

(define-public (set-active
    (agent principal)
    (active bool)
  )
  (let ((policy (try! (owned-policy agent))))
    (map-set policies agent (merge policy { active: active }))
    (print {
      event: "active-updated",
      agent: agent,
      active: active,
    })
    (ok true)
  )
)

;; Kill switch: pause the agent and return the whole balance to the owner.
(define-public (revoke (agent principal))
  (let (
      (policy (try! (owned-policy agent)))
      (owner (get owner policy))
      (amount (get balance policy))
    )
    (if (> amount u0)
      (try! (as-contract? ((with-stx amount))
        (try! (stx-transfer? amount tx-sender owner))
      ))
      true
    )
    (map-set policies agent
      (merge policy {
        balance: u0,
        active: false,
      })
    )
    (print {
      event: "revoked",
      agent: agent,
      refunded: amount,
    })
    (ok amount)
  )
)

;; Called by the agent key itself.
(define-public (pay
    (recipient principal)
    (amount uint)
    (memo (string-ascii 64))
  )
  (let (
      (agent contract-caller)
      (policy (unwrap! (map-get? policies agent) ERR_NO_POLICY))
      (window (current-window policy))
      (spent (+ (get spent window) amount))
    )
    (asserts! (get active policy) ERR_PAUSED)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts!
      (default-to false
        (map-get? allowed {
          agent: agent,
          recipient: recipient,
        })
      )
      ERR_RECIPIENT_NOT_ALLOWED
    )
    (asserts! (<= amount (get tx-cap policy)) ERR_OVER_TX_CAP)
    (asserts! (<= spent (get period-cap policy)) ERR_OVER_PERIOD_CAP)
    (asserts! (<= amount (get balance policy)) ERR_INSUFFICIENT_BALANCE)
    (try! (as-contract? ((with-stx amount))
      (try! (stx-transfer? amount tx-sender recipient))
    ))
    (map-set policies agent
      (merge policy {
        balance: (- (get balance policy) amount),
        period-start: (get start window),
        period-spent: spent,
        payments: (+ (get payments policy) u1),
      })
    )
    (print {
      event: "payment",
      agent: agent,
      recipient: recipient,
      amount: amount,
      memo: memo,
      period-spent: spent,
      balance: (- (get balance policy) amount),
    })
    (ok spent)
  )
)

(define-read-only (get-policy (agent principal))
  (map-get? policies agent)
)

(define-read-only (get-agents (owner principal))
  (default-to (list) (map-get? owner-agents owner))
)

(define-read-only (is-recipient-allowed
    (agent principal)
    (recipient principal)
  )
  (default-to false
    (map-get? allowed {
      agent: agent,
      recipient: recipient,
    })
  )
)

;; What the agent could spend right now: the smaller of the period budget left
;; and the balance, or zero when paused.
(define-read-only (get-available (agent principal))
  (match (map-get? policies agent)
    policy (let (
        (window (current-window policy))
        (left (- (get period-cap policy) (get spent window)))
      )
      (if (get active policy)
        (if (< left (get balance policy))
          left
          (get balance policy)
        )
        u0
      )
    )
    u0
  )
)
