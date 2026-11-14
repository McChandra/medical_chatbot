// Corrections to heuristic labels, not changes to publisher text or clinical review.
const goalHeading=/(?:what should|target|goal).*(?:ldl|cholesterol|blood pressure|level)|(?:ldl|cholesterol).*(?:target|goal)/i;
export function normalizeSourceLabel(p){
 return goalHeading.test(p.heading||'')?{...p,deck:4,intent:'therapy',overview:false,labelCorrection:'treatment-goal-heading-v1'}:p;
}
