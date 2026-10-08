
import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-JWT_SECRET";
export function adminValidateToken(req, res, next){
	const authHeader = req.headers.authorization
	const token = authHeader;
	if (!token) throw new ErrorHandler(403, "TOKEN IS REQUIRED")
	jwt.verify(
		token,
	    JWT_SECRET,
		function (err, decodedToken) {
			if (err) {
				throw new ErrorHandler(401, "TOKEN IS INVALID", err)
			} else {
				req.user = decodedToken;
				if (decodedToken.role == "ADMIN") {
					next();
				}
			}
		}
	);
};