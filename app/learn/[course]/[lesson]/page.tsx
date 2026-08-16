import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LearningLessonWorkspace from '@/components/LearningLessonWorkspace';
import { getLearningCourse, getLearningCourseLesson, getLessonSources } from '@/lib/learning/course-catalog';

interface PageProps { params: Promise<{ course: string; lesson: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { course: courseSlug, lesson: lessonSlug } = await params;
  const course = getLearningCourse(courseSlug);
  const lesson = course ? getLearningCourseLesson(course, lessonSlug) : null;
  return lesson ? { title: `${lesson.title} · ${course!.title}`, description: lesson.summary } : {};
}

export default async function LearningLessonPage({ params }: PageProps) {
  const { course: courseSlug, lesson: lessonSlug } = await params;
  const course = getLearningCourse(courseSlug);
  const lesson = course ? getLearningCourseLesson(course, lessonSlug) : null;
  if (!course || !lesson) notFound();
  return <LearningLessonWorkspace course={course} lesson={lesson} sources={getLessonSources(lesson)} />;
}
