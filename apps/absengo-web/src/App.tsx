import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import "./App.css";

function App() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <Card className="max-w-md w-full shadow-lg border-none">
        <CardHeader className="text-center space-y-1">
          <CardTitle className="text-4xl font-bold text-blue-600">
            AbsenGo
          </CardTitle>
          <CardDescription className="text-gray-500">
            Sistem Absensi Berbasis Web Modern
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <Button className="w-full h-12 text-lg font-semibold bg-blue-600 hover:bg-blue-700">
            Mulai Absensi
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 text-lg font-semibold border-slate-200 text-slate-700 hover:bg-slate-100"
          >
            Login Admin
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
