import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/context/AppContext";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import CreateVault from "./pages/CreateVault";
import Dashboard from "./pages/Dashboard";
import AddDocument from "./pages/AddDocument";
import DocumentDetail from "./pages/DocumentDetail";
import Members from "./pages/Members";
import Plans from "./pages/Plans";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/create-vault" element={<CreateVault />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/add-document" element={<AddDocument />} />
            <Route path="/document/:id" element={<DocumentDetail />} />
            <Route path="/members" element={<Members />} />
            <Route path="/viewers" element={<Members />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AppProvider>
  </QueryClientProvider>
);

export default App;
