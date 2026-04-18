import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>KSeF SaaS</CardTitle>
          <CardDescription>Fakturowanie zgodne z KSeF 2.0</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full">Zaloguj się</Button>
        </CardContent>
      </Card>
    </div>
  );
}
