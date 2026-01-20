import { ProjectWorkspace } from "@/components/dashboard/project-workspace";

export default function ChatPage() {
  return (
    <ProjectWorkspace 
      project={null}
      initialMessages={[]}
      role="viewer"
    />
  );
}
