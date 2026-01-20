export type Email = {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
};

export type Repo = {
  id: string;
  name: string;
  owner: string;
  stars: number;
  lastCommit: string;
  url: string;
};

export type Issue = {
  id: string;
  title: string;
  status: string;
  assignee: string;
};

export type Message = {
  id: string;
  channel: string;
  text: string;
  timestamp: string;
};

export type Page = {
  id: string;
  title: string;
  workspace: string;
  lastEdited: string;
};

export type NormalizedEntity = Email | Repo | Issue | Message | Page;

export function normalizeEntities(input: {
  entityType: "Email" | "Repo" | "Issue" | "Message" | "Page";
  raw: any;
  context?: Record<string, any>;
}): NormalizedEntity[] {
  const rawList = Array.isArray(input.raw) ? input.raw : input.raw ? [input.raw] : [];
  if (input.entityType === "Email") {
    return rawList.map((item: any) => {
      const headers = item?.payload?.headers ?? [];
      const subject = getHeader(headers, "Subject");
      const from = getHeader(headers, "From");
      const date = getHeader(headers, "Date");
      return {
        id: String(item?.id ?? ""),
        subject: subject || "Untitled",
        from: from || "Unknown",
        snippet: String(item?.snippet ?? ""),
        date: date || "",
      };
    });
  }
  if (input.entityType === "Repo") {
    return rawList.map((item: any) => ({
      id: String(item?.id ?? ""),
      name: String(item?.name ?? item?.full_name ?? "Unnamed"),
      owner: String(item?.owner?.login ?? item?.owner?.name ?? ""),
      stars: Number(item?.stargazers_count ?? 0),
      lastCommit: String(item?.pushed_at ?? item?.updated_at ?? ""),
      url: String(item?.html_url ?? ""),
    }));
  }
  if (input.entityType === "Issue") {
    return rawList.map((item: any) => ({
      id: String(item?.id ?? ""),
      title: String(item?.title ?? "Untitled"),
      status: String(item?.state?.name ?? item?.state ?? item?.status ?? ""),
      assignee: String(item?.assignee?.login ?? item?.assignee?.name ?? ""),
    }));
  }
  if (input.entityType === "Message") {
    const channel = String(input.context?.channel ?? "");
    return rawList.map((item: any) => ({
      id: String(item?.id ?? item?.ts ?? ""),
      channel: String(item?.channel ?? channel),
      text: String(item?.text ?? item?.snippet ?? ""),
      timestamp: String(item?.ts ?? item?.timestamp ?? ""),
    }));
  }
  return rawList.map((item: any) => ({
    id: String(item?.id ?? ""),
    title: String(
      item?.properties?.Name?.title?.[0]?.plain_text ??
        item?.properties?.title?.title?.[0]?.plain_text ??
        item?.title?.[0]?.plain_text ??
        item?.title ??
        "Untitled",
    ),
    workspace: String(
      item?.parent?.database_id ??
        item?.parent?.page_id ??
        item?.parent?.workspace ??
        "Notion",
    ),
    lastEdited: String(item?.last_edited_time ?? item?.lastEdited ?? ""),
  }));
}

function getHeader(headers: Array<{ name?: string; value?: string }>, key: string) {
  const match = headers.find((h) => h?.name?.toLowerCase() === key.toLowerCase());
  return match?.value ?? "";
}
