"use client";

import type { FormEvent } from "react";
import { deleteRecording } from "@/app/actions";

export function DeleteForm({ recordingId }: { recordingId: string }) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm("Delete this recording? This permanently removes the video and your ratings.")) {
      event.preventDefault();
    }
  }

  return (
    <form action={deleteRecording} onSubmit={onSubmit}>
      <input type="hidden" name="recordingId" value={recordingId} />
      <button className="danger">Delete recording</button>
    </form>
  );
}
