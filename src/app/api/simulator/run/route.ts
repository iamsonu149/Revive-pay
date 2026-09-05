import {simulationMetrics} from '@/domain/simulation/simulation-service';
import {merchantRequest} from '@/lib/api';
export function POST(request:Request){return merchantRequest(request,actor=>simulationMetrics(true,actor));}
