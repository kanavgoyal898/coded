export const ROLES = [
    "admin", 
    "setter", 
    "solver"
] as const;

export type Role = (
    typeof ROLES
)[number];
