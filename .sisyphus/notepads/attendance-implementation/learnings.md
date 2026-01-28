<file>
00001| # Learnings - Attendance Implementation
00002| 
00003| ## Conventions & Patterns Discovered
00004| 
00005| ## 2026-01-27 Session: Codebase Analysis
00006| 
00007| ### Backend (Rust/Axum) Patterns
00008| 
00009| **Route Registration Pattern:**
00010| 
00011| ```rust
00012| // In routes/{module}.rs
00013| pub fn routes() -> Router<Arc<AppState>> {
00014|     Router::new()
00015|         .route("/endpoint", axum::routing::get/post(handler::function))
00016|         .layer(axum::middleware::from_fn(require_auth))
00017| }
00018| // In main.rs - register with .nest("/api/{path}", routes::{module}::routes())
00019| ```
00020| 
00021| **Handler Pattern:**
00022| 
00023| ```rust
00024| pub async fn handler_name(
00025|     State(state): State<Arc<AppState>>,
00026|     Extension(claims): Extension<Claims>,
00027|     Json(payload): Json<RequestType>,
00028| ) -> impl IntoResponse {
00029|     // Access DB: state.db.collection::<Model>("collection")
00030|     // Access user_id: claims.sub (string, needs ObjectId::parse_str)
00031| }
00032| ```
00033| 
00034| **Error Response Pattern:**
00035| 
00036| - Return tuple: `(StatusCode::BAD_REQUEST, "message").into_response()`
00037| - Or Json: `(StatusCode::BAD_REQUEST, Json(json!({ "error": "message" })))`
00038| 
00039| **Models Pattern:**
00040| 
00041| - Use `#[serde(rename = "_id", skip_serializing_if = "Option::is_none")]` for id
00042| - Use `chrono::DateTime<Utc>` for timestamps
00043| - Use `mongodb::bson::oid::ObjectId` for IDs
00044| 
00045| **Existing Utilities:**
00046| 
00047| - `utils::geofence::is_within_geofence(user_loc, office_loc, radius_m)` - returns bool
00048| - `utils::face::compare_landmarks(landmarks1, landmarks2)` - returns f32 similarity
00049| 
00050| **User Model (apps/vexis-api/src/models/user.rs):**
00051| 
00052| - Has `face_landmarks: Vec<f32>` - flattened 1434 elements
00053| - Has `office_location: OfficeLocation` - GeoJSON Point
00054| 
00055| **Attendance Model (apps/vexis-api/src/models/attendance.rs):**
00056| 
00057| - `user_id: ObjectId`
00058| - `timestamp: DateTime<Utc>`
00059| - `type: String` - "In" | "Out"
00060| - `location: GeoPoint` - coordinates [long, lat]
00061| - `face_verified: bool`
00062| 
00063| ### Frontend (React/TypeScript) Patterns
00064| 
00065| **Page Pattern:**
00066| 
00067| ```tsx
00068| export default function FeaturePage() {
00069|   // State management with useState
00070|   // Effects with useEffect
00071|   return <div className="container mx-auto p-6 max-w-5xl space-y-8">...</div>;
00072| }
00073| ```
00074| 
00075| **API Client Pattern (lib/api.ts):**
00076| 
00077| ```typescript
00078| export interface ResponseType { ... }
00079| export const apiFunction = async (): Promise<ResponseType> => {
00080|   const response = await api.get/post<ResponseType>("/endpoint");
00081|   return response.data;
00082| };
00083| ```
00084| 
00085| **FaceCapture Component:**
00086| 
00087| - Props: `onCapture: (landmarks: number[]) => void`
00088| - Outputs: 1434-element array (478 points \* 3 coordinates)
00089| - Uses MediaPipe FaceLandmarker
00090| 
00091| **Geolocation Pattern:**
00092| 
00093| ```typescript
00094| navigator.geolocation.getCurrentPosition(
00095|   (position) => {
00096|     const lat = position.coords.latitude;
00097|     const lng = position.coords.longitude;
00098|   },
00099|   (error) => {
00100|     console.error(error);
00101|   },
00102| );
00103| ```
00104| 
00105| **Router Pattern (App.tsx):**
00106| 
00107| ```tsx
00108| <Route element={<ProtectedRoute allowedRoles={["user"]} />}>
00109|   <Route path="/route" element={<Page />} />
00110| </Route>
00111| ```
00112| 
00113| ### Key Configuration
00114| 
00115| **Office Location (Monas):** lat=-6.175392, long=106.827153
00116| **Geofence Radius:** 200m
00117| **Face Similarity Threshold:** 0.8
00118| 
00119| ## 2026-01-28 Session: Frontend Implementation
00120| 
00121| ### Attendance Page Implementation
00122| 
00123| **UI/UX Decisions:**
00124| - Used a split-layout (or stacked on mobile) with Camera as the primary focus.
00125| - Status cards for GPS and Face Detection provide clear feedback.
00126| - "Kirim Absensi" button is disabled until all conditions are met, preventing user error.
00127| - Added a "Back to Dashboard" button for better navigation flow.
00128| 
00129| **Technical Implementation:**
00130| - `navigator.geolocation` is wrapped in a `useEffect` for auto-fetching on mount.
00131| - `FaceCapture` component is used directly, handling the complex MediaPipe logic internally.
00132| - State management handles the asynchronous nature of both GPS and Face Detection.
00133| - `sonner` toasts provide immediate feedback for success/error states.
00134| 
00135| **Route Integration:**
00136| - Added `/attendance` to `App.tsx` within the `ProtectedRoute` for users.
00137| 
</file>
