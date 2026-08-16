import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LearningCourseWorkspace from '@/components/LearningCourseWorkspace';
import { getCourseSources, getLearningCourse } from '@/lib/learning/course-catalog';

interface PageProps { params: Promise<{ course: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { course: slug } = await params;
  const course = getLearningCourse(slug);
  return course ? { title: `${course.title} · 紫微学习中心`, description: course.description } : {};
}

export default async function LearningCoursePage({ params }: PageProps) {
  const { course: slug } = await params;
  const course = getLearningCourse(slug);
  if (!course) notFound();
  return <LearningCourseWorkspace course={course} sources={getCourseSources(course)} />;
}
