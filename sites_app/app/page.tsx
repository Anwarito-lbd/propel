import { requireChatGPTUser } from "./chatgpt-auth";
import CareerDashboard from "./career-dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <CareerDashboard user={{ name: user.fullName ?? user.displayName, email: user.email }} />;
}
