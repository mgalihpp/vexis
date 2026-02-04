import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem("refresh_token");

      if (refreshToken) {
        try {
          const { data } = await axios.post("/api/auth/refresh", {
            refresh_token: refreshToken,
          });

          localStorage.setItem("access_token", data.access_token);
          localStorage.setItem("refresh_token", data.refresh_token);

          // Update header and retry
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
          return api(originalRequest);
        } catch (refreshError) {
          // Refresh failed, logout
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          localStorage.removeItem("user");
          window.location.href = "/login";
        }
      } else {
        // No refresh token, logout
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

// Attendance API
export interface AttendanceCheckRequest {
  latitude: number;
  longitude: number;
  landmarks: number[];
}

export interface AttendanceCheckResponse {
  message: string;
  type: string;
  timestamp: string;
}

export const checkAttendance = async (
  data: AttendanceCheckRequest,
): Promise<AttendanceCheckResponse> => {
  const response = await api.post<AttendanceCheckResponse>(
    "/attendance/check",
    data,
  );
  return response.data;
};

// Dashboard API
export interface DashboardStatsResponse {
  check_in: string | null;
  check_out: string | null;
  recent_logs: AttendanceLog[];
}

export interface AttendanceLog {
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
}

// Admin API Types
export interface User {
  id: string;
  name: string;
  email: string;
  identifier: string;
  role: string;
  photo_url: string | null;
  has_face_landmarks: boolean;
  office_location: {
    type: string;
    coordinates: number[];
  } | null;
}

export interface UserListResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
}

export interface AttendanceAdminDetail {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  timestamp: string;
  type: string;
  latitude: number;
  longitude: number;
}

export interface AdminAttendanceResponse {
  data: AttendanceAdminDetail[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface AttendanceFilterParams extends PaginationParams {
  start_date?: string;
  end_date?: string;
  user_id?: string;
}

export const getDashboardStats = async (): Promise<DashboardStatsResponse> => {
  const response = await api.get<DashboardStatsResponse>("/dashboard/stats");
  return response.data;
};

// Admin API Functions
export const getUsers = async (
  params: PaginationParams,
): Promise<UserListResponse> => {
  const response = await api.get<UserListResponse>("/users", { params });
  return response.data;
};

export const deleteUser = async (id: string): Promise<void> => {
  await api.delete(`/users/${id}`);
};

export const getGlobalAttendance = async (
  params: AttendanceFilterParams,
): Promise<AdminAttendanceResponse> => {
  const response = await api.get<AdminAttendanceResponse>("/admin/attendance", {
    params,
  });
  return response.data;
};

export const downloadAttendanceReport = async (
  params: AttendanceFilterParams,
): Promise<void> => {
  const response = await api.get("/admin/attendance/export", {
    params,
    responseType: "blob",
  });

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute(
    "download",
    `attendance-report-${new Date().toISOString().split("T")[0]}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export default api;
