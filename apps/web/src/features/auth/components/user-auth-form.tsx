"use client";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { FormInput } from "@/components/forms/form-input";

const formSchema = z.object({
  email: z.string().email({ message: "Enter a valid email address" }),
});

type UserFormValue = z.infer<typeof formSchema>;

export default function UserAuthForm() {
  const [loading, startTransition] = useTransition();
  const defaultValues = {
    email: "demo@gmail.com",
  };
  const form = useForm<UserFormValue>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const onSubmit = async () => {
    startTransition(() => {
      console.log("continue with email clicked");
      toast.success("Signed In Successfully!");
    });
  };

  return (
    <>
      <Form
        form={form}
        onSubmit={form.handleSubmit(onSubmit)}
        className="w-full space-y-2"
      >
        <FormInput
          control={form.control}
          name="email"
          label="Email"
          placeholder="Enter your email..."
          disabled={loading}
        />
        <Button
          disabled={loading}
          className="mt-2 ml-auto w-full"
          type="submit"
        >
          Continue With Email
        </Button>
      </Form>
    </>
  );
}
