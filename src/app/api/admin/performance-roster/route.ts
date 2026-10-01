import { NextResponse, type NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { requireAdminAuth } from '@/lib/admin-auth';
import { db } from '@/db/client';
import { employees, technicianRoles, technicianPeriod } from '@/db/schema';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){const fail=await requireAdminAuth(req);if(fail)return fail;const d=db();const [roles,people,reports]=await Promise.all([d.select({code:technicianRoles.code,name:technicianRoles.name}).from(technicianRoles).where(eq(technicianRoles.active,true)),d.select({id:employees.serviceTitanId,name:employees.name}).from(employees).where(eq(employees.active,true)),d.selectDistinct({id:technicianPeriod.employeeId,name:technicianPeriod.employeeName}).from(technicianPeriod).where(sql`NOT EXISTS (SELECT 1 FROM employees e WHERE e.service_titan_id = technician_period.employee_id AND e.active = false)`) ]);const list=new Map<number,{id:number;name:string}>();for(const p of [...reports,...people])if(p.id!=null)list.set(Number(p.id),{id:Number(p.id),name:p.name});return NextResponse.json({roles,employees:[...list.values()].sort((a,b)=>a.name.localeCompare(b.name))});}
