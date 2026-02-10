import { Suspense } from "react";
import { ChatLauncherClient } from "./ChatLauncherClient";

export default function ChatPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ChatLauncherClient />
        </Suspense>
    );
}
