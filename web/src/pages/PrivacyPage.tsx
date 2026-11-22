// /privacy: what the site stores, who can see it, and how to get it deleted. Plain words, kept short.
// Keep it true: when the site starts storing something new, update this page in the same change.
import type { ReactNode } from 'react'
import Panel from '../components/Panel.tsx'

export default function PrivacyPage() {
  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Privacy</h1>
        <p className="mt-1 text-muted">A hobby site for one group of squash friends. No ads, no tracking, nothing sold.</p>
      </div>
      <Panel>
        <div className="space-y-5 text-sm text-soft">
          <Section title="What is stored">
            <ul className="list-disc space-y-1 pl-5">
              <li>Your email address, only to log in. It's never shown to anyone.</li>
              <li>Your password, only as a scrambled hash (scrypt). Nobody can read it, not even the admin.</li>
              <li>Your display name, the matches and results you report or confirm, your rating and tournaments.</li>
              <li>Players from the Discord bot: their Discord name and profile picture.</li>
            </ul>
          </Section>
          <Section title="Who can see it">
            Names, matches, ratings and tournaments are visible to anyone with the link to the site. Search engines are
            asked not to list it. Your email is never shown.
          </Section>
          <Section title="Cookies">
            One cookie that keeps you logged in (for 30 days, or until you log out). No tracking, analytics or third-party
            cookies, so there's nothing to accept.
          </Section>
          <Section title="Where it's kept">
            On one server at Hetzner in the EU. A backup copy is made every night, and backups are deleted after 14 days.
          </Section>
          <Section title="Deleting your data">
            Delete your account on the Account page: your email and password are deleted at once, and your name is replaced
            by "Deleted player" on your matches (they stay, so your opponents' ratings don't change). Backups that still
            contain them are gone within 14 days. For anything else, or if you're a Discord player, ask the admin in the
            group chat.
          </Section>
        </div>
      </Panel>
    </section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-1 font-semibold text-ink">{title}</h2>
      {children}
    </div>
  )
}
