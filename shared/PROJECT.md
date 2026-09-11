# 8xBuildAI — Project

A creative-AI generation platform: text and images in, video / image / audio out.
Modelled on Higgsfield's product surface, from the screenshots in
`higgsfieldscreenshots/`.

## Scope (MVP)

Derived from the seven reference screenshots, which define the surface:

| Area | Screenshot | Status |
|---|---|---|
| Explore / landing | `landingpage.png` | in scope |
| Video generation | `videogeneration.png` | in scope — primary flow |
| Image generation | `imagegeneration.png` | in scope |
| Audio / text-to-speech | `audiogeneration.png` | in scope |
| Pricing | `pricing.png` | in scope |
| Profile | `profile.png` | in scope |
| Account menu + credits | `profilebutton.png` | in scope |

Explicitly **not** built (per `.agents/research.md`: "Do not attempt to clone
every Higgsfield feature"): MCP, ChatGPT Plugin, Genjutsu, Effects, Cinema
Studio, Marketing Studio, Supercomputer, 3D, Blogs, social follow graph.
Those appear in the nav as disabled, honestly labelled — not as dead links.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vite + React + TypeScript + Tailwind v4 | fast dev server, no CDN dependency |
| Backend | Node 22 + Express (ESM) | matches the agent brief's API-first principle |
| Database | `node:sqlite` (built in) | real persistence, zero native compile on Windows |
| Auth | scrypt + signed session token (`node:crypto`) | no native bcrypt dependency |
| Media | local disk, served from `/files` | no cloud bucket needed to run |

## Core user flow (`.agents/qa.md`)

Signup → Dashboard → Create → Prompt → Generate → Processing → Completed →
Preview → Download.

This flow must work end-to-end with **no** third-party API key present.

## Credits

Mirrors the reference: a free account starts with 10 credits.
Video 5 · Image 1 · Audio 2 per generation. Generation is refused with a
`402 INSUFFICIENT_CREDITS` rather than failing halfway.
