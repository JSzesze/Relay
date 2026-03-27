import { randomUUID } from "node:crypto"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function createId(prefix: string) {
  return `${prefix}_${randomUUID()}`
}

export function safeTitle(value?: string | null, fallback = "Untitled") {
  const trimmed = value?.replace(/\s+/g, " ").trim()

  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

export function formatDate(value?: string | number | Date | null) {
  if (!value) {
    return "—"
  }

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "—"
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export function truncate(value: string, maxLength = 120) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}
