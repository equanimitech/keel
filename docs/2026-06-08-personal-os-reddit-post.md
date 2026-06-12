## Reddit post draft

*Suggested subs: r/ClaudeAI, r/ClaudeCode (cross-post). Tone: builder sharing, not selling.*

---

**Title:** I gave my Claude Code sessions a beginning and an end — a little "personal OS" of small skills

**Body:**

Claude Code is great at tasks and terrible at rhythm. My sessions used to just… sprawl. Start whenever, drift wherever, end when I was too fried to notice I should've stopped an hour earlier. Ideas I had mid-flow vanished. I couldn't remember what I decided three days ago.

So I spent a day building the missing rhythm — a set of small skills plus a quiet "focus gate" that give the workday a shape. Sharing the design in case it's useful (or in case you tell me I overbuilt it, also valid).

**The pieces, by when you'd use them:**

- **Start of a session — name two things.** *Intention* (what you're focused on) and *appetite* (how deep: quick check → light look → full analysis → deep dive — name's a nod to Shape Up's "appetite", pointed at depth instead of schedule). Both hold for the whole session. The assistant stays on the thread and answers at the depth you asked for — no firehose when you wanted a sentence.
- **Tangents don't derail you.** A "sidenote" either captures the stray idea in a second, or hands it to a background sub-agent that explores it *while you keep working*. Capture, don't chase.
- **A gate that helps you stop.** In the evening it starts favoring "land what's open" over "start something big." Push past your own stop-time and it firms up — but it's *your* rule and it bends when you mean it (a skip credit, basically). Nothing coerces.
- **Sign-off as a ritual.** End of day = a quick look back + a one-line "I'm done" you sign. The signature is what flips the gate closed for the night (and can shut the time-sink sites till morning). The day ends because you ended it.
- **Look back.** A recall command sweeps any window of days and gives you the gist, coarse-first — and knows committed decisions from passing thoughts. Plus a weekly review that's deliberately *thinking only*, building switched off.
- **Wake-up lives on your phone, not the editor** — light/water/stillness/movement before the screen. The laptop just confirms it happened.

**The principles, if you only steal one thing:**

- Nudges fire **once** then go quiet. Success = the tool disappearing.
- Every limit is **self-imposed and reversible**. You're always in control.
- **Depth on demand** — big picture first, zoom in when you want.
- **Private + local** — state stays on your machine.

Architecture-wise it's a clean split: a deterministic hook carries the cheap per-turn state (the gate, the intention/appetite reminders), and the "rituals" are just skills on top. The hook can't think, the skill can't enforce, and only *I* can sign things off.

Honestly the surprise was how much calmer the day felt once sessions had edges. The most useful thing wasn't more output — it was rhythm.

Happy to share the skill files if there's interest. **Curious what others do to give their AI sessions structure — or if you just… don't, and it's fine?**

---

*Draft. Companion to the longer article; this is the ship-it-tonight version.*
