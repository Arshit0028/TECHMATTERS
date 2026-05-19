// User & Permissions
export interface User {
  _id: string;
  name: string;
  employeeId?: string;
  joiningDate: string;
  email: string;
  phone?: string;
  bio?: string;
  department?: string;
  designation?: string;
  resume?: string;
  reportingManager?: User | string;
  status: 'active' | 'inactive';
  accessLevel: 'entry' | 'tech' | 'senior' | 'manager' | 'project-manager' | 'admin' | 'super-admin';
  permissions: Permission[];
  createdAt: string;
  role?: string;
}

export interface Permission {
  module: 'projects' | 'tasks' | 'invoices';
  actions: {
    read: boolean;
    write: boolean;
    create: boolean;
    delete: boolean;
    import: boolean;
    export: boolean;
  };
}

// Projects
export interface Milestone {
  name: string;
  dueDate?: string;
  completed: boolean;
  completedAt?: string;
}

export interface ProgressUpdate {
  _id: string;
  percentage: number;
  note: string;
  createdAt: string;
  addedBy: { _id: string; name: string; email: string; accessLevel: string };
}

export interface Project {
  _id: string;
  name: string;
  description: string;
  startDate: string;
  endDate?: string;
  milestones: Milestone[];
  teamMembers: User[];
  projectManager: User;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  status: 'Planned' | 'Active' | 'Completed' | 'On Hold' | 'In Progress' | 'Cancelled';
  progress: number;
  client?: string;
  progressUpdates?: ProgressUpdate[];
  createdBy: User;
  createdAt: string;
}

// Tasks
export interface Attachment {
  name: string;
  url: string;
  uploadedBy?: User;
  uploadedAt: string;
}

export interface Task {
  _id: string;
  project: Project;
  title: string;
  description: string;
  assignee?: User;
  assigner?: User;
  startDate?: string;
  endDate?: string;
  priority: 'Low' | 'Medium' | 'High';
  status: 'To Do' | 'In Progress' | 'Review' | 'Done';
  attachments: Attachment[];
  dependencies: Task[];
  createdAt: string;
  updatedAt: string;
}

// Activities
export interface Activity {
  _id: string;
  task: Task;
  name: string;
  description: string;
  assignee?: User;
  startDate?: string;
  endDate?: string;
  activityType: 'Daily' | 'One Time' | 'Weekly' | 'Monthly' | 'Yearly';
  priority: 'Low' | 'Medium' | 'High';
  status: 'Pending' | 'In Progress' | 'Completed';
  attachments: Attachment[];
  dependencies: Activity[];
  createdAt: string;
  updatedAt: string;
}

// Reimbursements
export interface Reimbursement {
  _id: string;
  employee: User;
  project?: Project;
  title: string;
  description: string;
  amount: number;
  expenseDate: string;
  receipts: Attachment[];
  status: 'Pending' | 'Approved' | 'Rejected' | 'Paid';
  submittedTo?: User;
  reviewerComments?: string;
  paymentStatus: 'Pending' | 'Processing' | 'Completed';
  paymentDate?: string;
  paymentMethod?: string;
  createdAt: string;
  updatedAt: string;
}

// Time Entries & Reports
export interface TimeEntry {
  _id: string;
  user: string | User;
  project: Project;
  date: string;
  hours: number;
  description: string;
  taskType: 'development' | 'meeting' | 'research' | 'bug-fix' | 'documentation';
}

export interface MonthlyReport {
  user: { name: string; email: string };
  year: number;
  month: number;
  entries: TimeEntry[];
  summary: {
    totalHours: number;
    totalEntries: number;
    projectBreakdown: Record<string, number>;
  };
}

// Auth
export interface AuthResponse {
  token: string;
  user: User;
}