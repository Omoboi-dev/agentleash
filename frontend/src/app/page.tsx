import About from '@/components/About';
import Dashboard from '@/components/leash/Dashboard';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#131416] text-white">
      <div className="max-w-[788px] w-[95%] mx-auto pb-12">
        <About />
        <Dashboard />
      </div>
    </main>
  );
}
