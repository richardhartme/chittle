# Architecture diagrams

These are [C4](https://c4model.com) diagrams of Chittle as it is built today. Each one zooms in on the one before it.

1. [System context](01-system-context.md): who uses Chittle and which outside services it depends on.
2. [Containers](02-containers.md): the deployable and runnable parts, and how they talk to each other.
3. [Components](03-components.md): the modules inside the Next.js web app.
4. [Assessment flow](04-assessment-flow.md): a dynamic diagram of one recording being uploaded and assessed.
5. [Deployment](05-deployment.md): where each container runs in production and in local development.

The diagrams are Mermaid flowcharts and sequence diagrams drawn with C4 notation, so GitHub and most Markdown previews render them without any extra tooling. Each box says what kind of element it is in square brackets, such as `[Container: Next.js 16]`.

| Colour | Element |
| --- | --- |
| Dark blue | Person |
| Blue | Chittle's own system, containers and components |
| Grey | External system |

## PNG exports

[`png/`](png) holds a PNG of each diagram, rendered at twice its natural size with Mermaid 11.4.1, for use where Mermaid doesn't render, such as slides or chat. Files with two diagrams export two PNGs:

| Diagram | PNG |
| --- | --- |
| System context | [`01-system-context.png`](png/01-system-context.png) |
| Containers | [`02-containers.png`](png/02-containers.png) |
| Components | [`03-components.png`](png/03-components.png), [`03-components-assessment-pipeline.png`](png/03-components-assessment-pipeline.png) |
| Assessment flow | [`04-assessment-flow.png`](png/04-assessment-flow.png) |
| Deployment | [`05-deployment-production.png`](png/05-deployment-production.png), [`05-deployment-local.png`](png/05-deployment-local.png) |

The Markdown is the source. After changing a diagram, export its PNG again.

Mermaid clips any label line wider than about 200px, and edge labels and box titles ignore the `wrappingWidth` that each flowchart sets for nodes. Keep each line of an edge label or a subgraph title to about 26 characters, splitting edge labels with `<br/>`. Keep subgraph titles to one line, because Mermaid draws a multi-line title over the box's contents.

## Keeping them current

Update the diagrams in the same change that alters what they show, such as a new external service, a new container or a module that moves. [GLOSSARY.md](../../GLOSSARY.md) defines the domain terms used in the labels, and [docs/adr](../adr) explains the decisions behind the shape:

- [ADR 0001](../adr/0001-deepgram-transcripts-and-hybrid-scoring.md): why Deepgram transcribes and Claude scores only the judged dimensions.
- [ADR 0002](../adr/0002-per-user-provider-keys.md): why assessment runs on each speaker's own provider keys.
- [ADR 0003](../adr/0003-assessments-run-in-after-with-stale-recovery.md): why assessments run in `after()` rather than in a job queue.
